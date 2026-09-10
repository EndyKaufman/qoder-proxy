import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { LogStoreService } from './log-store/log-store.service';
import { getModelMapping } from './qoder-cli/qoder-cli.models';
import {
  messagesToPrompt,
  extractTextContent,
  extractToolCalls,
  newId,
  buildDoneChunk,
  buildFullChatResponse,
  buildFullChatResponseWithTools,
} from './utils/format';
import type { ChatMessage } from './utils/format';
import {
  buildPromptWithTools,
  parseToolCallFromText,
  toOpenAIToolCalls,
} from './utils/tool-prompt';
import type { AppConfig } from './config/configuration';

// ---------------------------------------------------------------------------
// DTO (inline with OpenAPI decorators)
// ---------------------------------------------------------------------------

class ChatCompletionRequestDto {
  @ApiProperty({ description: 'Array of messages', example: [{ role: 'user', content: 'Hello' }] })
  messages!: Array<{ role: string; content: string | unknown[] }>;

  @ApiProperty({ description: 'Model name', required: false, default: 'auto' })
  model?: string;

  @ApiProperty({ description: 'Stream response', required: false, default: false })
  stream?: boolean;

  @ApiProperty({ description: 'Temperature', required: false })
  temperature?: number;

  @ApiProperty({ description: 'Max tokens', required: false })
  max_tokens?: number;

  @ApiProperty({ description: 'Tools array', required: false })
  tools?: unknown[];

  @ApiProperty({ description: 'Tool choice', required: false })
  tool_choice?: unknown;
}

const setSSEHeaders = (res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
};

@ApiTags('chat')
@Controller('v1/chat/completions')
@UseGuards(ApiKeyGuard)
export class ChatController {
  constructor(
    private configService: ConfigService<AppConfig>,
    private qoderCliService: QoderCliService,
    private logStoreService: LogStoreService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'GET returns error (use POST)' })
  @ApiResponse({ status: 400, description: 'Use POST method' })
  getNotSupported(@Res() res: Response) {
    return res.status(400).json({
      error: {
        message: 'Use POST method for chat completions',
        type: 'invalid_request_error',
        help: 'POST /v1/chat/completions with JSON body: {"messages": [...], "model": "auto"}',
      },
    });
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create chat completion' })
  @ApiResponse({ status: 200, description: 'Chat completion response' })
  create(@Body() body: ChatCompletionRequestDto, @Req() req: Request, @Res() res: Response) {
    const {
      messages,
      model: requestedModel,
      stream = false,
      tools,
      max_tokens,
    } = body || {} as ChatCompletionRequestDto;

    const userAgent = req.headers['user-agent'] || 'unknown';
    const hasTools = Array.isArray(tools) && tools.length > 0;

    if (
      userAgent.includes('Continue') ||
      userAgent.includes('Zed') ||
      userAgent.includes('Cursor') ||
      userAgent.includes('opencode')
    ) {
      console.log(
        '[IDE Request]',
        userAgent,
        'stream:',
        stream,
        'model:',
        requestedModel,
        'tools:',
        hasTools ? tools.length : 0,
      );
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
        },
      });
    }

    const model = getModelMapping(requestedModel);

    // Log model resolution
    if (requestedModel && model !== requestedModel) {
      this.logStoreService.addSystem(
        `Model "${requestedModel}" resolved to "${model}"`,
        'info',
        'model-map',
      );
    }

    const prompt = hasTools
      ? buildPromptWithTools(messages as unknown as ChatMessage[], tools as any, messagesToPrompt)
      : messagesToPrompt(messages as unknown as ChatMessage[]);
    const id = newId('chatcmpl');
    const timeoutMs = this.configService.get<number>('QODER_TIMEOUT_MS') || 120_000;
    const qoderMaxOutputTokens = this.configService.get<string>('QODER_MAX_OUTPUT_TOKENS');

    const flags: string[] = [];
    if (max_tokens != null) {
      if (max_tokens >= 32000) flags.push('--max-output-tokens', '32k');
      else if (max_tokens >= 16000) flags.push('--max-output-tokens', '16k');
    } else if (qoderMaxOutputTokens) {
      flags.push('--max-output-tokens', qoderMaxOutputTokens);
    }

    if (stream) {
      setSSEHeaders(res);

      const streamStartTime = Date.now();
      req.socket.setTimeout(0);
      req.socket.setKeepAlive(true);

      // Send role chunk immediately for IDE compatibility
      const firstChunk = {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: hasTools ? { role: 'assistant' } : { role: 'assistant', content: '' },
            finish_reason: null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(firstChunk)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      let lastFinishReason = 'stop';
      let hasReceivedData = false;
      let fullStreamText = '';
      let clientAborted = false;

      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        onChunk: (data) => {
          const content = extractTextContent(data.message);
          const finishReason = data.message?.stop_reason || null;
          if (!hasReceivedData) {
            console.log('[Stream Timing] First chunk at', Date.now() - streamStartTime, 'ms');
            hasReceivedData = true;
          }
          if (finishReason) lastFinishReason = finishReason;
          if (content) {
            fullStreamText += content;
            if (!hasTools) {
              const chunk = {
                id,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content }, finish_reason: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          }
        },
        onDone: (code, stderr) => {
          if (clientAborted || res.writableEnded) return;
          if (code !== 0) {
            console.error('[chat/completions] qodercli exit code:', code, stderr?.substring(0, 200));
          }

          if (hasTools) {
            const toolCall = parseToolCallFromText(fullStreamText);
            if (toolCall) {
              const callId = `call_${newId('tc').replace('tc-', '')}`;
              const toolCalls = toOpenAIToolCalls(toolCall, callId);
              const tcChunk = {
                id,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  { index: 0, delta: { tool_calls: toolCalls }, finish_reason: null },
                ],
              };
              res.write(`data: ${JSON.stringify(tcChunk)}\n\n`);
              lastFinishReason = 'tool_calls';
            }
          }

          res.write(`data: ${JSON.stringify(buildDoneChunk(model, id, lastFinishReason))}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        },
        onError: (err) => {
          if (clientAborted || res.writableEnded) return;
          console.error('[chat/completions] error:', err.message);
          res.write(
            `data: ${JSON.stringify({ error: { message: err.message, type: err.code === 'TIMEOUT' ? 'timeout_error' : 'api_error' } })}\n\n`,
          );
          res.end();
        },
      });

      req.on('aborted', () => {
        clientAborted = true;
        console.log('[Stream] Client disconnected at', Date.now() - streamStartTime, 'ms');
        if (!res.writableEnded) child.kill();
      });
    } else {
      // Non-streaming path
      let fullContent = '';
      let finishReason = 'stop';
      let allToolCalls: ReturnType<typeof extractToolCalls> extends infer T ? T extends Array<infer U> ? U[] : never : never = [];
      let clientAborted = false;

      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        onChunk: (data) => {
          const content = extractTextContent(data.message);
          const toolCalls = extractToolCalls(data.message?.content as unknown[]);
          if (content) fullContent += content;
          if (toolCalls && toolCalls.length > 0) {
            allToolCalls.push(...toolCalls);
            finishReason = 'tool_calls';
          }
          if (data.message?.stop_reason) finishReason = data.message.stop_reason;
        },
        onDone: (code, stderr) => {
          if (clientAborted || res.writableEnded) return;
          if (code !== 0) {
            return res.status(500).json({
              error: {
                message: `qodercli exited with code ${code}`,
                type: 'api_error',
                details: stderr,
              },
            });
          }

          if (hasTools && allToolCalls.length === 0) {
            const toolCall = parseToolCallFromText(fullContent);
            if (toolCall) {
              const callId = `call_${newId('tc').replace('tc-', '')}`;
              allToolCalls = toOpenAIToolCalls(toolCall, callId);
              finishReason = 'tool_calls';
              fullContent = '';
            }
          }

          if (allToolCalls.length > 0) {
            res.json(
              buildFullChatResponseWithTools(allToolCalls, fullContent || null, model, finishReason, id),
            );
          } else {
            res.json(buildFullChatResponse(fullContent, model, finishReason, id));
          }
        },
        onError: (err) => {
          if (clientAborted || res.writableEnded) return;
          res.status(err.code === 'TIMEOUT' ? 504 : 500).json({
            error: {
              message: err.message,
              type: err.code === 'TIMEOUT' ? 'timeout_error' : 'api_error',
            },
          });
        },
      });

      req.on('aborted', () => {
        clientAborted = true;
        if (!res.writableEnded) child.kill();
      });
    }
  }
}
