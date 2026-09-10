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
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const config_1 = require("@nestjs/config");
let AppController = class AppController {
    constructor(qoderCliService, configService) {
        this.qoderCliService = qoderCliService;
        this.configService = configService;
    }
    getInfo() {
        const dashboardEnabled = this.configService.get('DASHBOARD_ENABLED');
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
    async getHealth(res) {
        const version = await this.qoderCliService.checkQoderCli();
        const statusCode = version ? 200 : 503;
        res.status(statusCode).json({
            status: version ? 'ok' : 'degraded',
            qodercli: version || 'unavailable',
            timestamp: new Date().toISOString(),
        });
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Service info' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns service information' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "getInfo", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: 'Health check' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Service is healthy' }),
    (0, swagger_1.ApiResponse)({ status: 503, description: 'qodercli unavailable' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getHealth", null);
exports.AppController = AppController = __decorate([
    (0, swagger_1.ApiTags)('root'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [qoder_cli_service_1.QoderCliService,
        config_1.ConfigService])
], AppController);
