import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { DashboardAuthGuard, createToken, setCookie, clearCookie } from './common/guards/dashboard-auth.guard';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { LogStoreService } from './log-store/log-store.service';
import { QODER_MODELS, getModelMapping } from './qoder-cli/qoder-cli.models';
import {
  messagesToPrompt,
  extractTextContent,
  newId,
  buildStreamChunk,
  buildDoneChunk,
} from './utils/format';
import type { AppConfig } from './config/configuration';

const PUBLIC_DIR = path.join(__dirname, 'dashboard', 'public');

const statusCache: { checkedAt: number; version: string | null } = {
  checkedAt: 0,
  version: null,
};

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private configService: ConfigService<AppConfig>,
    private qoderCliService: QoderCliService,
    private logStoreService: LogStoreService,
  ) {}

  private async refreshQoderStatus(): Promise<string | null> {
    const version = await this.qoderCliService.checkQoderCli();
    statusCache.version = version;
    statusCache.checkedAt = Date.now();
    return version;
  }

  // ── Public routes (no auth) ──────────────────────────────────────────────────

  @Get('login')
  @ApiOperation({ summary: 'Dashboard login page' })
  loginPage(@Res() res: Response) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }

  @Post('login')
  @ApiOperation({ summary: 'Dashboard login' })
  async loginPost(@Body() body: { password?: string }, @Res() res: Response) {
    const { password } = body || {};
    const dashboardPassword = this.configService.get<string>('DASHBOARD_PASSWORD');
    if (password && password === dashboardPassword) {
      const secret = this.configService.get<string>('DASHBOARD_SECRET') || '';
      setCookie(
        (name, value) => res.setHeader(name, value),
        createToken(secret),
      );
      this.logStoreService.addSystem('Dashboard login successful', 'info', 'auth');
      return res.redirect('/dashboard/');
    }
    this.logStoreService.addSystem('Dashboard login failed — wrong password', 'warn', 'auth');
    return res.redirect('/dashboard/login?error=1');
  }

  @Get('logout')
  @ApiOperation({ summary: 'Dashboard logout' })
  logout(@Res() res: Response) {
    clearCookie((name, value) => res.setHeader(name, value));
    this.logStoreService.addSystem('Dashboard logout', 'info', 'auth');
    return res.redirect('/dashboard/login');
  }

  // ── Auth wall (all routes below require auth) ────────────────────────────────

  @Get()
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Dashboard SPA shell' })
  spaShell(@Res() res: Response) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }

  @Get('api/config')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Dashboard config' })
  getConfig(@Req() req: Request) {
    const publicBaseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      `${req.protocol}://${req.get('host')}`;
    return {
      publicBaseUrl,
      proxyApiKey: this.configService.get<string>('API_KEY') || null,
      authEnabled: !!this.configService.get<string>('API_KEY'),
      version: '2.0.0',
    };
  }

  @Get('api/status')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Dashboard status' })
  async getStatus() {
    const now = Date.now();
    if (now - statusCache.checkedAt > 30000) {
      this.refreshQoderStatus().catch(() => {});
    }
    const version = statusCache.version;
    const mem = process.memoryUsage();
    return {
      status: version && version !== 'timeout' ? 'ok' : 'degraded',
      qodercli: version || 'unavailable',
      uptime: process.uptime(),
      memoryMB: (mem.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    };
  }

  @Get('api/models')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Dashboard models list' })
  getModels() {
    return { models: QODER_MODELS };
  }

  @Post('api/chat')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Dashboard playground chat (SSE)' })
  dashboardChat(
    @Body() body: { messages?: unknown[]; model?: string },
    @Res() res: Response,
  ) {
    const { messages, model: requestedModel = 'auto' } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'messages is required and must be a non-empty array',
      });
    }
    const model = getModelMapping(requestedModel);
    const prompt = messagesToPrompt(messages as Parameters<typeof messagesToPrompt>[0]);
    const id = newId('chatcmpl');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial SSE connection event
    res.write('data: {"type":"connection","status":"connected"}\n\n');

    const timeoutMs = this.configService.get<number>('QODER_TIMEOUT_MS') || 120_000;
    const qoderMaxOutputTokens = this.configService.get<string>('QODER_MAX_OUTPUT_TOKENS');
    const flags = qoderMaxOutputTokens
      ? ['--max-output-tokens', qoderMaxOutputTokens]
      : [];

    let lastFinishReason = 'stop';
    let emittedTextChunks = 0;
    let emittedAnyChars = 0;

    this.qoderCliService.runQoderRequest({
      prompt,
      model,
      flags,
      timeoutMs,
      onChunk: (data) => {
        const content = extractTextContent(data.message);
        if (data.message?.stop_reason) lastFinishReason = data.message.stop_reason;
        if (content) {
          emittedTextChunks += 1;
          emittedAnyChars += content.length;
          res.write(`data: ${JSON.stringify(buildStreamChunk(content, model, id))}\n\n`);
        }
      },
      onDone: (code, stderr) => {
        const lastStderr = stderr || '';

        if (emittedTextChunks === 0 && emittedAnyChars === 0) {
          const fallback =
            code !== 0
              ? `qodercli exited with code ${code}${lastStderr ? `: ${lastStderr.slice(0, 180)}` : ''}`
              : 'No response text was emitted by qodercli stream (empty output).';
          res.write(`data: ${JSON.stringify(buildStreamChunk(fallback, model, id))}\n\n`);
          lastFinishReason = code !== 0 ? 'error' : 'stop';
        }
        res.write(`data: ${JSON.stringify(buildDoneChunk(model, id, lastFinishReason))}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (err) => {
        res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
        res.end();
      },
    });
  }

  @Get('api/logs')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Request logs' })
  getRequestLogs() {
    return { logs: this.logStoreService.getRequests() };
  }

  @Delete('api/logs')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Clear request logs' })
  clearRequestLogs() {
    this.logStoreService.clearRequests();
    this.logStoreService.addSystem('Request logs cleared', 'info', 'dashboard');
    return { ok: true };
  }

  @Get('api/logs/system')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'System logs' })
  getSystemLogs() {
    return { logs: this.logStoreService.getSystem() };
  }

  @Delete('api/logs/system')
  @UseGuards(DashboardAuthGuard)
  @ApiOperation({ summary: 'Clear system logs' })
  clearSystemLogs() {
    this.logStoreService.clearSystem();
    return { ok: true };
  }
}
