import { Controller, Post, Body, Res, Req, UseGuards, HttpCode, OnModuleDestroy } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { ProjectConfigService } from './project-config/project-config.service';
import { McpGenService } from './mcp-gen/mcp-gen.service';
import { WebhookService } from './webhook/webhook.service';
import type { WebhookPayload } from './webhook/webhook.service';
import { PluginStorageService } from './plugin-storage/plugin-storage.service';
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

  @ApiProperty({ description: 'Webhook URL for async callback after completion', required: false })
  webhook_url?: string;
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
export class CompletionsController implements OnModuleDestroy {
  private mcpTempFiles: string[] = [];

  constructor(
    private configService: ConfigService<AppConfig>,
    private qoderCliService: QoderCliService,
    private projectConfigService: ProjectConfigService,
    private mcpGenService: McpGenService,
    private webhookService: WebhookService,
    private pluginStorageService: PluginStorageService,
  ) {}

  onModuleDestroy() {
    for (const f of this.mcpTempFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }

  private prepareProjectContext(): { mcpConfigPath: string; systemPrompt: string; cwd: string } | undefined {
    const projects = this.projectConfigService.getAll();
    if (projects.length === 0) return undefined;

    const mcpConfig = this.mcpGenService.generateMcpConfig(projects, this.configService.get<string>('PLUGINS_DB_PATH'));
    const mcpConfigPath = this.mcpGenService.writeMcpConfigFile(mcpConfig);
    this.mcpTempFiles.push(mcpConfigPath);

    const dashboardAppsDir = this.configService.get<string>('DASHBOARD_APPS_DIR');
    const plugins = this.pluginStorageService.getAllPlugins().map((p) => {
      const activeVersion = this.pluginStorageService.getActiveVersion(p.id);
      return { slug: p.slug, name: p.name, description: p.description, version: activeVersion?.version || null };
    });
    const systemPrompt = this.projectConfigService.generateCatalogPrompt(dashboardAppsDir, plugins);
    const cwd = projects[0].path || this.configService.get<string>('PROJECTS_ROOT_DIR') || '/projects';

    return { mcpConfigPath, systemPrompt, cwd };
  }

  private cleanupMcpConfig(mcpConfigPath?: string) {
    if (!mcpConfigPath) return;
    this.mcpTempFiles = this.mcpTempFiles.filter(f => f !== mcpConfigPath);
    try { fs.unlinkSync(mcpConfigPath); } catch { /* ignore */ }
  }

  private fireWebhook(webhookUrl: string | undefined, payload: WebhookPayload) {
    if (!webhookUrl) return;
    this.webhookService.sendWebhook(webhookUrl, payload).catch((err) => {
      console.error('[webhook] Unhandled error:', err.message);
    });
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create text completion' })
  @ApiResponse({ status: 200, description: 'Completion response' })
  create(@Body() body: CompletionRequestDto, @Req() req: Request, @Res() res: Response) {
    const { prompt, model: requestedModel, stream = false, temperature, max_tokens, webhook_url } = body;

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

    // Prepare per-request project context (MCP config + system prompt + cwd)
    const projectCtx = this.prepareProjectContext();

    if (stream) {
      setSSEHeaders(res);
      const streamStartTime = Date.now();

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
      let fullStreamText = '';
      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        mcpConfigPath: projectCtx?.mcpConfigPath,
        systemPrompt: projectCtx?.systemPrompt,
        cwd: projectCtx?.cwd,
        onChunk: (data) => {
          const text = extractTextContent(data.message);
          if (text) {
            fullStreamText += text;
            res.write(`data: ${JSON.stringify(buildCompletionStreamChunk(text, model, id))}\n\n`);
          }
        },
        onDone: (_code, _stderr) => {
          this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
          this.fireWebhook(webhook_url, {
            status: 'success', model, response: fullStreamText.substring(0, 5000),
            duration_ms: Date.now() - streamStartTime, timestamp: new Date().toISOString(),
          });
          if (clientAborted || res.writableEnded) return;
          res.write('data: [DONE]\n\n');
          res.end();
        },
        onError: (err) => {
          this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
          this.fireWebhook(webhook_url, {
            status: 'error', model, error: err.message,
            duration_ms: Date.now() - streamStartTime, timestamp: new Date().toISOString(),
          });
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
      const nonStreamStart = Date.now();

      const child = this.qoderCliService.runQoderRequest({
        prompt,
        model,
        flags,
        timeoutMs,
        mcpConfigPath: projectCtx?.mcpConfigPath,
        systemPrompt: projectCtx?.systemPrompt,
        cwd: projectCtx?.cwd,
        onChunk: (data) => {
          fullText += extractTextContent(data.message);
          if (data.message?.stop_reason) finishReason = data.message.stop_reason;
        },
        onDone: (code, stderr) => {
          this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
          const duration = Date.now() - nonStreamStart;
          if (code !== 0) {
            this.fireWebhook(webhook_url, {
              status: 'error', model, error: `exit code ${code}: ${stderr?.substring(0, 200) || ''}`,
              duration_ms: duration, timestamp: new Date().toISOString(),
            });
          } else {
            this.fireWebhook(webhook_url, {
              status: 'success', model, response: fullText.substring(0, 5000),
              duration_ms: duration, timestamp: new Date().toISOString(),
            });
          }
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
          this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
          this.fireWebhook(webhook_url, {
            status: 'error', model, error: err.message,
            duration_ms: Date.now() - nonStreamStart, timestamp: new Date().toISOString(),
          });
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
