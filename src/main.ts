import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { LogStoreService } from './log-store/log-store.service';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<AppConfig>);
  const qoderCliService = app.get(QoderCliService);
  const logStoreService = app.get(LogStoreService);

  // CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN') || '*';
  app.enableCors({ origin: corsOrigin });

  // Body parsers (match original Express config)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.json({ limit: '10mb' }));
  expressApp.use(express.urlencoded({ extended: true }));

  // Dashboard static assets
  const dashboardEnabled = configService.get<boolean>('DASHBOARD_ENABLED');
  if (dashboardEnabled) {
    const path = require('path');
    const publicDir = path.join(__dirname, 'dashboard', 'public');
    expressApp.use('/dashboard/static', express.static(publicDir));
  }

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Qoder OpenAI Proxy')
    .setDescription('OpenAI-compatible proxy for qodercli')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Startup checks
  const version = await qoderCliService.checkQoderCli();
  const pat = configService.get<string>('QODER_PAT');
  const apiKey = configService.get<string>('API_KEY');
  const dashboardPassword = configService.get<string>('DASHBOARD_PASSWORD');
  const port = configService.get<number>('PORT') || 3000;

  if (!pat) {
    logStoreService.addSystem(
      'QODER_PERSONAL_ACCESS_TOKEN is not set — qodercli auth will fail',
      'error',
      'startup',
    );
    console.warn(
      '⚠️  Set QODER_PERSONAL_ACCESS_TOKEN in your environment (or QODER_API_KEY as alias)',
    );
  }

  if (version && version !== 'timeout') {
    logStoreService.addSystem(`qodercli detected: ${version}`, 'info', 'startup');
  } else if (version === 'timeout') {
    logStoreService.addSystem(
      'qodercli startup check timed out — binary may exist but failed to start quickly',
      'error',
      'startup',
    );
    console.warn(
      '⚠️  qodercli startup check timed out. Set QODERCLI_BIN (e.g. /usr/local/bin/qodercli) and verify container CPU/memory limits.',
    );
  } else {
    logStoreService.addSystem(
      'qodercli not found on PATH — requests will fail',
      'error',
      'startup',
    );
    console.warn('⚠️  Install: npm install -g @qoder-ai/qodercli');
  }

  if (!apiKey) {
    logStoreService.addSystem(
      'PROXY_API_KEY not set — proxy is open (no auth)',
      'warn',
      'startup',
    );
    console.warn('⚠️  Set PROXY_API_KEY in .env to require Bearer token auth');
  }

  if (dashboardEnabled && !dashboardPassword) {
    logStoreService.addSystem(
      'DASHBOARD_PASSWORD not set — dashboard is inaccessible',
      'error',
      'startup',
    );
    console.warn('⚠️  Set DASHBOARD_PASSWORD in .env to access the dashboard');
  }

  await app.listen(port);
  console.log(`\n🚀 Qoder OpenAI Proxy  →  http://localhost:${port}`);
  console.log(
    `   Auth     : ${apiKey ? 'Enabled (Bearer token)' : 'Disabled (open access)'}`,
  );
  console.log(
    `   Dashboard: ${dashboardEnabled ? `http://localhost:${port}/dashboard/` : 'Disabled'}`,
  );
  console.log(`   CORS     : ${corsOrigin}`);
  console.log(`   Timeout  : ${configService.get<number>('QODER_TIMEOUT_MS')}ms\n`);
  console.log(`   Swagger  : http://localhost:${port}/api/docs\n`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
