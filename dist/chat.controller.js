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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const fs = __importStar(require("fs"));
const api_key_guard_1 = require("./common/guards/api-key.guard");
const config_1 = require("@nestjs/config");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const log_store_service_1 = require("./log-store/log-store.service");
const project_config_service_1 = require("./project-config/project-config.service");
const mcp_gen_service_1 = require("./mcp-gen/mcp-gen.service");
const webhook_service_1 = require("./webhook/webhook.service");
const plugin_storage_service_1 = require("./plugin-storage/plugin-storage.service");
const qoder_cli_models_1 = require("./qoder-cli/qoder-cli.models");
const format_1 = require("./utils/format");
const tool_prompt_1 = require("./utils/tool-prompt");
// ---------------------------------------------------------------------------
// DTO (inline with OpenAPI decorators)
// ---------------------------------------------------------------------------
class ChatCompletionRequestDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of messages', example: [{ role: 'user', content: 'Hello' }] }),
    __metadata("design:type", Array)
], ChatCompletionRequestDto.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Model name', required: false, default: 'auto' }),
    __metadata("design:type", String)
], ChatCompletionRequestDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Stream response', required: false, default: false }),
    __metadata("design:type", Boolean)
], ChatCompletionRequestDto.prototype, "stream", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Temperature', required: false }),
    __metadata("design:type", Number)
], ChatCompletionRequestDto.prototype, "temperature", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Max tokens', required: false }),
    __metadata("design:type", Number)
], ChatCompletionRequestDto.prototype, "max_tokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tools array', required: false }),
    __metadata("design:type", Array)
], ChatCompletionRequestDto.prototype, "tools", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tool choice', required: false }),
    __metadata("design:type", Object)
], ChatCompletionRequestDto.prototype, "tool_choice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Webhook URL for async callback after completion', required: false }),
    __metadata("design:type", String)
], ChatCompletionRequestDto.prototype, "webhook_url", void 0);
const setSSEHeaders = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
};
let ChatController = class ChatController {
    constructor(configService, qoderCliService, logStoreService, projectConfigService, mcpGenService, webhookService, pluginStorageService) {
        this.configService = configService;
        this.qoderCliService = qoderCliService;
        this.logStoreService = logStoreService;
        this.projectConfigService = projectConfigService;
        this.mcpGenService = mcpGenService;
        this.webhookService = webhookService;
        this.pluginStorageService = pluginStorageService;
        /** Track temp MCP config files to clean up */
        this.mcpTempFiles = [];
    }
    onModuleDestroy() {
        // Clean up any leftover temp MCP config files
        for (const f of this.mcpTempFiles) {
            try {
                fs.unlinkSync(f);
            }
            catch { /* ignore */ }
        }
    }
    /**
     * Generate per-request MCP config file and system prompt from loaded projects.
     * Returns paths/strings to pass to qodercli, or undefined if no projects configured.
     */
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
        // Use first project's path as default cwd, or PROJECTS_ROOT_DIR
        const cwd = projects[0].path || this.configService.get('PROJECTS_ROOT_DIR') || '/projects';
        return { mcpConfigPath, systemPrompt, cwd };
    }
    /** Clean up a temp MCP config file after request completes */
    cleanupMcpConfig(mcpConfigPath) {
        if (!mcpConfigPath)
            return;
        this.mcpTempFiles = this.mcpTempFiles.filter(f => f !== mcpConfigPath);
        try {
            fs.unlinkSync(mcpConfigPath);
        }
        catch { /* ignore */ }
    }
    /** Fire-and-forget webhook callback */
    fireWebhook(webhookUrl, payload) {
        if (!webhookUrl)
            return;
        this.webhookService.sendWebhook(webhookUrl, payload).catch((err) => {
            console.error('[webhook] Unhandled error:', err.message);
        });
    }
    getNotSupported(res) {
        return res.status(400).json({
            error: {
                message: 'Use POST method for chat completions',
                type: 'invalid_request_error',
                help: 'POST /v1/chat/completions with JSON body: {"messages": [...], "model": "auto"}',
            },
        });
    }
    create(body, req, res) {
        const { messages, model: requestedModel, stream = false, tools, max_tokens, webhook_url, } = body || {};
        const userAgent = req.headers['user-agent'] || 'unknown';
        const hasTools = Array.isArray(tools) && tools.length > 0;
        if (userAgent.includes('Continue') ||
            userAgent.includes('Zed') ||
            userAgent.includes('Cursor') ||
            userAgent.includes('opencode')) {
            console.log('[IDE Request]', userAgent, 'stream:', stream, 'model:', requestedModel, 'tools:', hasTools ? tools.length : 0);
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
        const model = (0, qoder_cli_models_1.getModelMapping)(requestedModel);
        // Log model resolution
        if (requestedModel && model !== requestedModel) {
            this.logStoreService.addSystem(`Model "${requestedModel}" resolved to "${model}"`, 'info', 'model-map');
        }
        const prompt = hasTools
            ? (0, tool_prompt_1.buildPromptWithTools)(messages, tools, format_1.messagesToPrompt)
            : (0, format_1.messagesToPrompt)(messages);
        const id = (0, format_1.newId)('chatcmpl');
        const timeoutMs = this.configService.get('QODER_TIMEOUT_MS') || 120_000;
        const qoderMaxOutputTokens = this.configService.get('QODER_MAX_OUTPUT_TOKENS');
        const flags = [];
        if (max_tokens != null) {
            if (max_tokens >= 32000)
                flags.push('--max-output-tokens', '32k');
            else if (max_tokens >= 16000)
                flags.push('--max-output-tokens', '16k');
        }
        else if (qoderMaxOutputTokens) {
            flags.push('--max-output-tokens', qoderMaxOutputTokens);
        }
        // Prepare per-request project context (MCP config + system prompt + cwd)
        const projectCtx = this.prepareProjectContext();
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
            if (typeof res.flush === 'function')
                res.flush();
            let lastFinishReason = 'stop';
            let hasReceivedData = false;
            let fullStreamText = '';
            let clientAborted = false;
            const child = this.qoderCliService.runQoderRequest({
                prompt,
                model,
                flags,
                timeoutMs,
                mcpConfigPath: projectCtx?.mcpConfigPath,
                systemPrompt: projectCtx?.systemPrompt,
                cwd: projectCtx?.cwd,
                onChunk: (data) => {
                    const content = (0, format_1.extractTextContent)(data.message);
                    const finishReason = data.message?.stop_reason || null;
                    if (!hasReceivedData) {
                        console.log('[Stream Timing] First chunk at', Date.now() - streamStartTime, 'ms');
                        hasReceivedData = true;
                    }
                    if (finishReason)
                        lastFinishReason = finishReason;
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
                    this.cleanupMcpConfig(projectCtx?.mcpConfigPath);
                    const duration = Date.now() - streamStartTime;
                    if (code !== 0) {
                        this.fireWebhook(webhook_url, {
                            status: 'error', model, error: `exit code ${code}: ${stderr?.substring(0, 200) || ''}`,
                            duration_ms: duration, timestamp: new Date().toISOString(),
                        });
                    }
                    else {
                        this.fireWebhook(webhook_url, {
                            status: 'success', model, response: fullStreamText.substring(0, 5000),
                            duration_ms: duration, timestamp: new Date().toISOString(),
                        });
                    }
                    if (clientAborted || res.writableEnded)
                        return;
                    if (code !== 0) {
                        console.error('[chat/completions] qodercli exit code:', code, stderr?.substring(0, 200));
                    }
                    if (hasTools) {
                        const toolCall = (0, tool_prompt_1.parseToolCallFromText)(fullStreamText);
                        if (toolCall) {
                            const callId = `call_${(0, format_1.newId)('tc').replace('tc-', '')}`;
                            const toolCalls = (0, tool_prompt_1.toOpenAIToolCalls)(toolCall, callId);
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
                    res.write(`data: ${JSON.stringify((0, format_1.buildDoneChunk)(model, id, lastFinishReason))}\n\n`);
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
                    console.error('[chat/completions] error:', err.message);
                    res.write(`data: ${JSON.stringify({ error: { message: err.message, type: err.code === 'TIMEOUT' ? 'timeout_error' : 'api_error' } })}\n\n`);
                    res.end();
                },
            });
            req.on('aborted', () => {
                clientAborted = true;
                console.log('[Stream] Client disconnected at', Date.now() - streamStartTime, 'ms');
                if (!res.writableEnded)
                    child.kill();
            });
        }
        else {
            // Non-streaming path
            let fullContent = '';
            let finishReason = 'stop';
            let allToolCalls = [];
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
                    const content = (0, format_1.extractTextContent)(data.message);
                    const toolCalls = (0, format_1.extractToolCalls)(data.message?.content);
                    if (content)
                        fullContent += content;
                    if (toolCalls && toolCalls.length > 0) {
                        allToolCalls.push(...toolCalls);
                        finishReason = 'tool_calls';
                    }
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
                            status: 'success', model, response: fullContent.substring(0, 5000),
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
                    if (hasTools && allToolCalls.length === 0) {
                        const toolCall = (0, tool_prompt_1.parseToolCallFromText)(fullContent);
                        if (toolCall) {
                            const callId = `call_${(0, format_1.newId)('tc').replace('tc-', '')}`;
                            allToolCalls = (0, tool_prompt_1.toOpenAIToolCalls)(toolCall, callId);
                            finishReason = 'tool_calls';
                            fullContent = '';
                        }
                    }
                    if (allToolCalls.length > 0) {
                        res.json((0, format_1.buildFullChatResponseWithTools)(allToolCalls, fullContent || null, model, finishReason, id));
                    }
                    else {
                        res.json((0, format_1.buildFullChatResponse)(fullContent, model, finishReason, id));
                    }
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
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'GET returns error (use POST)' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Use POST method' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getNotSupported", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Create chat completion' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Chat completion response' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ChatCompletionRequestDto, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "create", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chat'),
    (0, common_1.Controller)('v1/chat/completions'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    __metadata("design:paramtypes", [config_1.ConfigService,
        qoder_cli_service_1.QoderCliService,
        log_store_service_1.LogStoreService,
        project_config_service_1.ProjectConfigService,
        mcp_gen_service_1.McpGenService,
        webhook_service_1.WebhookService,
        plugin_storage_service_1.PluginStorageService])
], ChatController);
