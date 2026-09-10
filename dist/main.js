"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const express = __importStar(require("express"));
const app_module_1 = require("./app.module");
const config_1 = require("@nestjs/config");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const log_store_service_1 = require("./log-store/log-store.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get((config_1.ConfigService));
    const qoderCliService = app.get(qoder_cli_service_1.QoderCliService);
    const logStoreService = app.get(log_store_service_1.LogStoreService);
    // CORS
    const corsOrigin = configService.get('CORS_ORIGIN') || '*';
    app.enableCors({ origin: corsOrigin });
    // Body parsers (match original Express config)
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use(express.json({ limit: '10mb' }));
    expressApp.use(express.urlencoded({ extended: true }));
    // Dashboard static assets
    const dashboardEnabled = configService.get('DASHBOARD_ENABLED');
    if (dashboardEnabled) {
        const path = require('path');
        const publicDir = path.join(__dirname, 'dashboard', 'public');
        expressApp.use('/dashboard/static', express.static(publicDir));
    }
    // Swagger
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Qoder OpenAI Proxy')
        .setDescription('OpenAI-compatible proxy for qodercli')
        .setVersion('2.0.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    // Startup checks
    const version = await qoderCliService.checkQoderCli();
    const pat = configService.get('QODER_PAT');
    const apiKey = configService.get('API_KEY');
    const dashboardPassword = configService.get('DASHBOARD_PASSWORD');
    const port = configService.get('PORT') || 3000;
    if (!pat) {
        logStoreService.addSystem('QODER_PERSONAL_ACCESS_TOKEN is not set — qodercli auth will fail', 'error', 'startup');
        console.warn('⚠️  Set QODER_PERSONAL_ACCESS_TOKEN in your environment (or QODER_API_KEY as alias)');
    }
    if (version && version !== 'timeout') {
        logStoreService.addSystem(`qodercli detected: ${version}`, 'info', 'startup');
    }
    else if (version === 'timeout') {
        logStoreService.addSystem('qodercli startup check timed out — binary may exist but failed to start quickly', 'error', 'startup');
        console.warn('⚠️  qodercli startup check timed out. Set QODERCLI_BIN (e.g. /usr/local/bin/qodercli) and verify container CPU/memory limits.');
    }
    else {
        logStoreService.addSystem('qodercli not found on PATH — requests will fail', 'error', 'startup');
        console.warn('⚠️  Install: npm install -g @qoder-ai/qodercli');
    }
    if (!apiKey) {
        logStoreService.addSystem('PROXY_API_KEY not set — proxy is open (no auth)', 'warn', 'startup');
        console.warn('⚠️  Set PROXY_API_KEY in .env to require Bearer token auth');
    }
    if (dashboardEnabled && !dashboardPassword) {
        logStoreService.addSystem('DASHBOARD_PASSWORD not set — dashboard is inaccessible', 'error', 'startup');
        console.warn('⚠️  Set DASHBOARD_PASSWORD in .env to access the dashboard');
    }
    await app.listen(port);
    console.log(`\n🚀 Qoder OpenAI Proxy  →  http://localhost:${port}`);
    console.log(`   Auth     : ${apiKey ? 'Enabled (Bearer token)' : 'Disabled (open access)'}`);
    console.log(`   Dashboard: ${dashboardEnabled ? `http://localhost:${port}/dashboard/` : 'Disabled'}`);
    console.log(`   CORS     : ${corsOrigin}`);
    console.log(`   Timeout  : ${configService.get('QODER_TIMEOUT_MS')}ms\n`);
    console.log(`   Swagger  : http://localhost:${port}/api/docs\n`);
}
bootstrap().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
