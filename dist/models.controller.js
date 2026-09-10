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
exports.ModelsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_key_guard_1 = require("./common/guards/api-key.guard");
const qoder_cli_models_1 = require("./qoder-cli/qoder-cli.models");
const OPENAI_ALIASES = [
    { id: 'gpt-4', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'gpt-4-turbo', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'gpt-4o', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'gpt-4o-mini', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'gpt-3.5-turbo', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'o1', resolves_to: 'ultimate', description: 'Alias → ultimate tier' },
    { id: 'o1-mini', resolves_to: 'performance', description: 'Alias → performance tier' },
    { id: 'o3-mini', resolves_to: 'performance', description: 'Alias → performance tier' },
    { id: 'claude-3-opus', resolves_to: 'ultimate', description: 'Alias → ultimate tier' },
    { id: 'claude-3-sonnet', resolves_to: 'performance', description: 'Alias → performance tier' },
    { id: 'claude-3-haiku', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'claude-3.5-sonnet', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'claude-3.5-haiku', resolves_to: 'performance', description: 'Alias → performance tier' },
    { id: 'claude-3.7-sonnet', resolves_to: 'auto', description: 'Alias → auto tier' },
    { id: 'gemini-pro', resolves_to: 'performance', description: 'Alias → performance tier' },
    { id: 'gemini-flash', resolves_to: 'efficient', description: 'Alias → efficient tier' },
    { id: 'qwen', resolves_to: 'qmodel', description: 'Alias → Qwen3.6-Plus' },
    { id: 'deepseek', resolves_to: 'dmodel', description: 'Alias → DeepSeek-V4-Pro' },
    { id: 'deepseek-v4', resolves_to: 'dmodel', description: 'Alias → DeepSeek-V4-Pro' },
    { id: 'deepseek-v4-flash', resolves_to: 'dfmodel', description: 'Alias → DeepSeek-V4-Flash' },
    { id: 'glm', resolves_to: 'gm51model', description: 'Alias → GLM-5.1' },
    { id: 'glm51', resolves_to: 'gm51model', description: 'Alias → GLM-5.1' },
    { id: 'qwen36plus', resolves_to: 'qmodel', description: 'Alias → Qwen3.6-Plus' },
    { id: 'kimi', resolves_to: 'kmodel', description: 'Alias → Kimi-K2.6' },
    { id: 'minimax', resolves_to: 'mmodel', description: 'Alias → MiniMax new model' },
];
const TS = 1700000000;
let ModelsController = class ModelsController {
    getModels() {
        const nativeModels = qoder_cli_models_1.QODER_MODELS.map((m) => ({
            id: m.id,
            object: 'model',
            created: TS,
            owned_by: `qoder-${m.tier}`,
            qoder: {
                label: m.label,
                tier: m.tier,
                description: m.description,
                is_alias: false,
            },
        }));
        const aliasModels = OPENAI_ALIASES.map((a) => ({
            id: a.id,
            object: 'model',
            created: TS,
            owned_by: 'qoder-alias',
            qoder: {
                label: a.id,
                tier: 'alias',
                description: a.description,
                resolves_to: a.resolves_to,
                is_alias: true,
            },
        }));
        return { object: 'list', data: [...nativeModels, ...aliasModels] };
    }
    embeddings(res) {
        return res.status(501).json({
            error: {
                message: 'Embeddings are not supported. qodercli does not generate embeddings. ' +
                    'Use OpenAI, Cohere, or a local model (Ollama / sentence-transformers) instead.',
                type: 'not_implemented_error',
                code: 'endpoint_not_supported',
            },
        });
    }
    // Catch-all for unknown /v1/* routes
    catchAllGet(req, res) {
        return res.status(404).json({
            error: {
                message: `Unknown endpoint: ${req.method} /v1${req.path}. See GET /v1/models for available endpoints.`,
                type: 'invalid_request_error',
                code: 'endpoint_not_found',
            },
        });
    }
    catchAllPost(req, res) {
        return res.status(404).json({
            error: {
                message: `Unknown endpoint: ${req.method} /v1${req.path}. See GET /v1/models for available endpoints.`,
                type: 'invalid_request_error',
                code: 'endpoint_not_found',
            },
        });
    }
};
exports.ModelsController = ModelsController;
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({ summary: 'List available models' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Model list in OpenAI format' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "getModels", null);
__decorate([
    (0, common_1.Post)('embeddings'),
    (0, swagger_1.ApiOperation)({ summary: 'Embeddings (not supported)' }),
    (0, swagger_1.ApiResponse)({ status: 501, description: 'Not implemented' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "embeddings", null);
__decorate([
    (0, common_1.Get)('*'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "catchAllGet", null);
__decorate([
    (0, common_1.Post)('*'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "catchAllPost", null);
exports.ModelsController = ModelsController = __decorate([
    (0, swagger_1.ApiTags)('models'),
    (0, common_1.Controller)('v1'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard)
], ModelsController);
