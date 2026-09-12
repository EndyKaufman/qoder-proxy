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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const path = __importStar(require("path"));
const config_1 = require("@nestjs/config");
const dashboard_auth_guard_1 = require("./common/guards/dashboard-auth.guard");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const log_store_service_1 = require("./log-store/log-store.service");
const dashboard_apps_service_1 = require("./dashboard-apps/dashboard-apps.service");
const qoder_cli_models_1 = require("./qoder-cli/qoder-cli.models");
const format_1 = require("./utils/format");
const PUBLIC_DIR = path.join(__dirname, 'dashboard', 'public');
const statusCache = {
    checkedAt: 0,
    version: null,
};
let DashboardController = class DashboardController {
    constructor(configService, qoderCliService, logStoreService, dashboardAppsService) {
        this.configService = configService;
        this.qoderCliService = qoderCliService;
        this.logStoreService = logStoreService;
        this.dashboardAppsService = dashboardAppsService;
    }
    async refreshQoderStatus() {
        const version = await this.qoderCliService.checkQoderCli();
        statusCache.version = version;
        statusCache.checkedAt = Date.now();
        return version;
    }
    // ── Public routes (no auth) ──────────────────────────────────────────────────
    loginPage(res) {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
    async loginPost(body, res) {
        const { password } = body || {};
        const dashboardPassword = this.configService.get('DASHBOARD_PASSWORD');
        if (password && password === dashboardPassword) {
            const secret = this.configService.get('DASHBOARD_SECRET') || '';
            (0, dashboard_auth_guard_1.setCookie)((name, value) => res.setHeader(name, value), (0, dashboard_auth_guard_1.createToken)(secret));
            this.logStoreService.addSystem('Dashboard login successful', 'info', 'auth');
            return res.redirect('/dashboard/');
        }
        this.logStoreService.addSystem('Dashboard login failed — wrong password', 'warn', 'auth');
        return res.redirect('/dashboard/login?error=1');
    }
    logout(res) {
        (0, dashboard_auth_guard_1.clearCookie)((name, value) => res.setHeader(name, value));
        this.logStoreService.addSystem('Dashboard logout', 'info', 'auth');
        return res.redirect('/dashboard/login');
    }
    // ── Auth wall (all routes below require auth) ────────────────────────────────
    spaShell(res) {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
    getConfig(req) {
        const publicBaseUrl = this.configService.get('PUBLIC_BASE_URL') ||
            `${req.protocol}://${req.get('host')}`;
        return {
            publicBaseUrl,
            proxyApiKey: this.configService.get('API_KEY') || null,
            authEnabled: !!this.configService.get('API_KEY'),
            version: '2.0.0',
        };
    }
    getApps() {
        return { apps: this.dashboardAppsService.listApps() };
    }
    async getStatus() {
        const now = Date.now();
        if (now - statusCache.checkedAt > 30000) {
            this.refreshQoderStatus().catch(() => { });
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
    getModels() {
        return { models: qoder_cli_models_1.QODER_MODELS };
    }
    dashboardChat(body, res) {
        const { messages, model: requestedModel = 'auto' } = body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: 'messages is required and must be a non-empty array',
            });
        }
        const model = (0, qoder_cli_models_1.getModelMapping)(requestedModel);
        const prompt = (0, format_1.messagesToPrompt)(messages);
        const id = (0, format_1.newId)('chatcmpl');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        // Send initial SSE connection event
        res.write('data: {"type":"connection","status":"connected"}\n\n');
        const timeoutMs = this.configService.get('QODER_TIMEOUT_MS') || 120_000;
        const qoderMaxOutputTokens = this.configService.get('QODER_MAX_OUTPUT_TOKENS');
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
                const content = (0, format_1.extractTextContent)(data.message);
                if (data.message?.stop_reason)
                    lastFinishReason = data.message.stop_reason;
                if (content) {
                    emittedTextChunks += 1;
                    emittedAnyChars += content.length;
                    res.write(`data: ${JSON.stringify((0, format_1.buildStreamChunk)(content, model, id))}\n\n`);
                }
            },
            onDone: (code, stderr) => {
                const lastStderr = stderr || '';
                if (emittedTextChunks === 0 && emittedAnyChars === 0) {
                    const fallback = code !== 0
                        ? `qodercli exited with code ${code}${lastStderr ? `: ${lastStderr.slice(0, 180)}` : ''}`
                        : 'No response text was emitted by qodercli stream (empty output).';
                    res.write(`data: ${JSON.stringify((0, format_1.buildStreamChunk)(fallback, model, id))}\n\n`);
                    lastFinishReason = code !== 0 ? 'error' : 'stop';
                }
                res.write(`data: ${JSON.stringify((0, format_1.buildDoneChunk)(model, id, lastFinishReason))}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            },
            onError: (err) => {
                res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
                res.end();
            },
        });
    }
    getRequestLogs() {
        return { logs: this.logStoreService.getRequests() };
    }
    clearRequestLogs() {
        this.logStoreService.clearRequests();
        this.logStoreService.addSystem('Request logs cleared', 'info', 'dashboard');
        return { ok: true };
    }
    getSystemLogs() {
        return { logs: this.logStoreService.getSystem() };
    }
    clearSystemLogs() {
        this.logStoreService.clearSystem();
        return { ok: true };
    }
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Get)('login'),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard login page' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "loginPage", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard login' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "loginPost", null);
__decorate([
    (0, common_1.Get)('logout'),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard logout' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard SPA shell' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "spaShell", null);
__decorate([
    (0, common_1.Get)('api/config'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard config' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Get)('api/apps'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List dashboard mini-apps' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of dashboard apps with metadata' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "getApps", null);
__decorate([
    (0, common_1.Get)('api/status'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard status' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)('api/models'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard models list' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "getModels", null);
__decorate([
    (0, common_1.Post)('api/chat'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dashboard playground chat (SSE)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "dashboardChat", null);
__decorate([
    (0, common_1.Get)('api/logs'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Request logs' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "getRequestLogs", null);
__decorate([
    (0, common_1.Delete)('api/logs'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Clear request logs' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "clearRequestLogs", null);
__decorate([
    (0, common_1.Get)('api/logs/system'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'System logs' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "getSystemLogs", null);
__decorate([
    (0, common_1.Delete)('api/logs/system'),
    (0, common_1.UseGuards)(dashboard_auth_guard_1.DashboardAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Clear system logs' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DashboardController.prototype, "clearSystemLogs", null);
exports.DashboardController = DashboardController = __decorate([
    (0, swagger_1.ApiTags)('dashboard'),
    (0, common_1.Controller)('dashboard'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        qoder_cli_service_1.QoderCliService,
        log_store_service_1.LogStoreService,
        dashboard_apps_service_1.DashboardAppsService])
], DashboardController);
