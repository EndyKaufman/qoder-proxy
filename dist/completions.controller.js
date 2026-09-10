"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const api_key_guard_1 = require("./common/guards/api-key.guard");
const config_1 = require("@nestjs/config");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
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
const setSSEHeaders = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
};
let CompletionsController = class CompletionsController {
    constructor(configService, qoderCliService) {
        this.configService = configService;
        this.qoderCliService = qoderCliService;
    }
    create(body, req, res) {
        const { prompt, model: requestedModel, stream = false, temperature, max_tokens } = body;
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
                    const text = (0, format_1.extractTextContent)(data.message);
                    if (text) {
                        res.write(`data: ${JSON.stringify((0, format_1.buildCompletionStreamChunk)(text, model, id))}\n\n`);
                    }
                },
                onDone: (_code, _stderr) => {
                    if (clientAborted || res.writableEnded)
                        return;
                    res.write('data: [DONE]\n\n');
                    res.end();
                },
                onError: (err) => {
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
            const child = this.qoderCliService.runQoderRequest({
                prompt,
                model,
                flags,
                timeoutMs,
                onChunk: (data) => {
                    fullText += (0, format_1.extractTextContent)(data.message);
                    if (data.message?.stop_reason)
                        finishReason = data.message.stop_reason;
                },
                onDone: (code, stderr) => {
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
        qoder_cli_service_1.QoderCliService])
], CompletionsController);
