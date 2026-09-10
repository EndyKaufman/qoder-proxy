import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config/configuration';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(
    private qoderCliService: QoderCliService,
    private configService: ConfigService<AppConfig>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service info' })
  @ApiResponse({ status: 200, description: 'Returns service information' })
  getInfo() {
    const dashboardEnabled = this.configService.get<boolean>('DASHBOARD_ENABLED');
    return {
      name: 'Qoder OpenAI Proxy',
      version: '2.0.0',
      dashboard: dashboardEnabled ? '/dashboard/' : 'disabled',
      endpoints: [
        'GET /v1/models',
        'POST /v1/chat/completions',
        'POST /v1/completions',
        'GET /health',
      ],
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'qodercli unavailable' })
  async getHealth(@Res() res: Response) {
    const version = await this.qoderCliService.checkQoderCli();
    const statusCode = version ? 200 : 503;
    res.status(statusCode).json({
      status: version ? 'ok' : 'degraded',
      qodercli: version || 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
}
