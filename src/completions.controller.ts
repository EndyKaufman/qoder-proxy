import { Controller, Post, Body, Res, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { getModelMapping } from './qoder-cli/qoder-cli.models';
import {
  extractTextContent,
  newId,
  buildCompletionStreamChunk,
  buildFullCompletionResponse,
} from './utils/format';
import type { AppConfig } from './config/configuration';

// ---------------------------------------------------------------------------
// DTO (inline with OpenAPI decorators)
// ---------------------------------------------------------------------------

class CompletionRequestDto {
  @ApiProperty({ description: 'The prompt text', example: 'Hello world' })
  prompt!: string;

  @ApiProperty({ description: 'Model name', required: false })
  model?: string;

  @ApiProperty({ description: 'Stream response', required: false, default: false })
  stream?: boolean;

  @ApiProperty({ description: 'Temperature', required: false })
  temperature?: number;

  @ApiProperty({ description: 'Max tokens', required: false })
  max_tokens?: number;
}

const setSSEHeaders = (res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
};

@ApiTags('completions')
@Controller('v1/completions')
@UseGuards(ApiKeyGuard)
export class CompletionsController {
  constructor(
    private configService: ConfigService<AppConfig>,
    private qoderCliService: QoderCliService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create text completion' })
  @ApiResponse({ status: 200, description: 'Completion response' })
  create(@Body() body: CompletionRequestDto, @Req() req: Request, @Res() res: Response) {
    const { prompt, model: requestedModel, stream = false, temperature, max_tokens } = body;

    if (!prompt) {
      return res.status(400).json({
        error: { message: 'prompt is required', type: 'invalid_request_error' },
      });
    }

    const model = getModelMapping(requestedModel);
    const id = newId('cmpl');
    const timeoutMs = this.configService.get<number>('QODER_TIMEOUT_MS') || 120_000;

    const flags: string[] = [];
    if (max_tokens != null) flags.push('--max-tokens', String(max_tokens));
    if (temperature != null) flags.push('--temperature', String(temperature));

    if (stream) {
      setSSEHeaders(res);

      // Send initial empty chunk immediately (required for IDE tools)
      const initialChunk = {
        id,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ text: '', index: 0, logprobs: null, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

      let clientAborted = false;
      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        onChunk: (data) => {
          const text = extractTextContent(data.message);
          if (text) {
            res.write(`data: ${JSON.stringify(buildCompletionStreamChunk(text, model, id))}\n\n`);
          }
        },
        onDone: (_code, _stderr) => {
          if (clientAborted || res.writableEnded) return;
          res.write('data: [DONE]\n\n');
          res.end();
        },
        onError: (err) => {
          if (clientAborted || res.writableEnded) return;
          console.error('[completions]', err.message);
          res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
          res.end();
        },
      });

      req.on('aborted', () => {
        clientAborted = true;
        if (!res.writableEnded) child.kill();
      });
    } else {
      let fullText = '';
      let finishReason = 'stop';
      let clientAborted = false;

      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        onChunk: (data) => {
          fullText += extractTextContent(data.message);
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
          res.json(buildFullCompletionResponse(fullText, model, finishReason, id));
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
