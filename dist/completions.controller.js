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
exports.CompletionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const fs = __importStar(require("fs"));
const api_key_guard_1 = require("./common/guards/api-key.guard");
const config_1 = require("@nestjs/config");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const project_config_service_1 = require("./project-config/project-config.service");
const mcp_gen_service_1 = require("./mcp-gen/mcp-gen.service");
const webhook_service_1 = require("./webhook/webhook.service");
const plugin_storage_service_1 = require("./plugin-storage/plugin-storage.service");
const qoder_cli_models_1 = require("./qoder-cli/qoder-cli.models");
const format_1 = require("./utils/format");
// ---------------------------------------------------------------------------
// DTO (inline with OpenAPI decorators)
// ---------------------------------------------------------------------------
class CompletionRequestDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'The prompt text', example: 'Hello world' }),
    __metadata("design:type", String)
], CompletionRequestDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Model name', required: false }),
    __metadata("design:type", String)
], CompletionRequestDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stream response', required: false, default: false }),
    __metadata("design:type", Boolean)
], CompletionRequestDto.prototype, "stream", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Temperature', required: false }),
    __metadata("design:type", Number)
], CompletionRequestDto.prototype, "temperature", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Max tokens', required: false }),
    __metadata("design:type", Number)
], CompletionRequestDto.prototype, "max_tokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Webhook URL for async callback after completion', required: false }),
    __metadata("design:type", String)
], CompletionRequestDto.prototype, "webhook_url", void 0);
const setSSEHeaders = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
};
let CompletionsController = class CompletionsController {
    constructor(configService, qoderCliService, projectConfigService, mcpGenService, webhookService, pluginStorageService) {
        this.configService = configService;
        this.qoderCliService = qoderCliService;
        this.projectConfigService = projectConfigService;
        this.mcpGenService = mcpGenService;
        this.webhookService = webhookService;
        this.pluginStorageService = pluginStorageService;
        this.mcpTempFiles = [];
    }
    onModuleDestroy() {
        for (const f of this.mcpTempFiles) {
            try {
                fs.unlinkSync(f);
            }
            catch { /* ignore */ }
        }
    }
    prepareProjectContext() {
        const projects = this.projectConfigService.getAll();
        if (projects.length === 0)
            return undefined;
        const mcpConfig = this.mcpGenService.generateMcpConfig(projects, this.configService.get('PLUGINS_DB_PATH'));
        const mcpConfigPath = this.mcpGenService.writeMcpConfigFile(mcpConfig);
        this.mcpTempFiles.push(mcpConfigPath);
        const dashboardAppsDir = this.configService.get('DASHBOARD_APPS_DIR');
        const plugins = this.pluginStorageService.getAllPlugins().map((p) => {
            const activeVersion = this.pluginStorageService.getActiveVersion(p.id);
            return { slug: p.slug, name: p.name, description: p.description, version: activeVersion?.version || null };
        });
        const systemPrompt = this.projectConfigService.generateCatalogPrompt(dashboardAppsDir, plugins);
        const cwd = projects[0].path || this.configService.get('PROJECTS_ROOT_DIR') || '/projects';
        return { mcpConfigPath, systemPrompt, cwd };
    }
    cleanupMcpConfig(mcpConfigPath) {
        if (!mcpConfigPath)
            return;
        this.mcpTempFiles = this.mcpTempFiles.filter(f => f !== mcpConfigPath);
        try {
            fs.unlinkSync(mcpConfigPath);
        }
        catch { /* ignore */ }
    }
    fireWebhook(webhookUrl, payload) {
        if (!webhookUrl)
            return;
        this.webhookService.sendWebhook(webhookUrl, payload).catch((err) => {
            console.error('[webhook] Unhandled error:', err.message);
        });
    }
    create(body, req, res) {
        const { prompt, model: requestedModel, stream = false, temperature, max_tokens, webhook_url } = body;
        if (!prompt) {
            return res.status(400).json({
                error: { message: 'prompt is required', type: 'invalid_request_error' },
            });
        }
        const model = (0, qoder_cli_models_1.getModelMapping)(requestedModel);
        const id = (0, format_1.newId)('cmpl');
        const timeoutMs = this.configService.get('QODER_TIMEOUT_MS') || 120_000;
        const flags = [];
        if (max_tokens != null)
            flags.push('--max-tokens', String(max_tokens));
        if (temperature != null)
            flags.push('--temperature', String(temperature));
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
                    const text = (0, format_1.extractTextContent)(data.message);
                    if (text) {
                        fullStreamText += text;
                        res.write(`data: ${JSON.stringify((0, format_1.buildCompletionStreamChunk)(text, model, id))}\n\n`);
                    }
                },
                onDone: (_code, _stderr) => {
                    this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
                    this.fireWebhook(webhook_url, {
                        status: 'success', model, response: fullStreamText.substring(0, 5000),
                        duration_ms: Date.now() - streamStartTime, timestamp: new Date().toISOString(),
                    });
                    if (clientAborted || res.writableEnded)
                        return;
                    res.write('data: [DONE]\n\n');
                    res.end();
                },
                onError: (err) => {
                    this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
                    this.fireWebhook(webhook_url, {
                        status: 'error', model, error: err.message,
                        duration_ms: Date.now() - streamStartTime, timestamp: new Date().toISOString(),
                    });
                    if (clientAborted || res.writableEnded)
                        return;
                    console.error('[completions]', err.message);
                    res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
                    res.end();
                },
            });
            req.on('aborted', () => {
                clientAborted = true;
                if (!res.writableEnded)
                    child.kill();
            });
        }
        else {
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
                    fullText += (0, format_1.extractTextContent)(data.message);
                    if (data.message?.stop_reason)
                        finishReason = data.message.stop_reason;
                },
                onDone: (code, stderr) => {
                    this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
                    const duration = Date.now() - nonStreamStart;
                    if (code !== 0) {
                        this.fireWebhook(webhook_url, {
                            status: 'error', model, error: `exit code ${code}: ${stderr?.substring(0, 200) || ''}`,
                            duration_ms: duration, timestamp: new Date().toISOString(),
                        });
                    }
                    else {
                        this.fireWebhook(webhook_url, {
                            status: 'success', model, response: fullText.substring(0, 5000),
                            duration_ms: duration, timestamp: new Date().toISOString(),
                        });
                    }
                    if (clientAborted || res.writableEnded)
                        return;
                    if (code !== 0) {
                        return res.status(500).json({
                            error: {
                                message: `qodercli exited with code ${code}`,
                                type: 'api_error',
                                details: stderr,
                            },
                        });
                    }
                    res.json((0, format_1.buildFullCompletionResponse)(fullText, model, finishReason, id));
                },
                onError: (err) => {
                    this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
                    this.fireWebhook(webhook_url, {
                        status: 'error', model, error: err.message,
                        duration_ms: Date.now() - nonStreamStart, timestamp: new Date().toISOString(),
                    });
                    if (clientAborted || res.writableEnded)
                        return;
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
                if (!res.writableEnded)
                    child.kill();
            });
        }
    }
};
exports.CompletionsController = CompletionsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Create text completion' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Completion response' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CompletionRequestDto, Object, Object]),
    __metadata("design:returntype", void 0)
], CompletionsController.prototype, "create", null);
exports.CompletionsController = CompletionsController = __decorate([
    (0, swagger_1.ApiTags)('completions'),
    (0, common_1.Controller)('v1/completions'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __metadata("design:paramtypes", [config_1.ConfigService,
        qoder_cli_service_1.QoderCliService,
        project_config_service_1.ProjectConfigService,
        mcp_gen_service_1.McpGenService,
        webhook_service_1.WebhookService,
        plugin_storage_service_1.PluginStorageService])
], CompletionsController);
