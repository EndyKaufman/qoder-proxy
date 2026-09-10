"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const configuration_1 = __importDefault(require("./config/configuration"));
const app_controller_1 = require("./app.controller");
const chat_controller_1 = require("./chat.controller");
const completions_controller_1 = require("./completions.controller");
const models_controller_1 = require("./models.controller");
const dashboard_controller_1 = require("./dashboard.controller");
const qoder_cli_service_1 = require("./qoder-cli/qoder-cli.service");
const log_store_service_1 = require("./log-store/log-store.service");
const logger_middleware_1 = require("./common/middleware/logger.middleware");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const core_1 = require("@nestjs/core");
let AppModule = class AppModule {
    configure(consumer) {
        consumer
            .apply(logger_middleware_1.LoggerMiddleware)
            .forRoutes('v1/*', 'dashboard/api/chat');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                load: [configuration_1.default],
                isGlobal: true,
            }),
        ],
        controllers: [
            app_controller_1.AppController,
            chat_controller_1.ChatController,
            completions_controller_1.CompletionsController,
            models_controller_1.ModelsController,
            dashboard_controller_1.DashboardController,
        ],
        providers: [
            qoder_cli_service_1.QoderCliService,
            log_store_service_1.LogStoreService,
            {
                provide: core_1.APP_FILTER,
                useClass: global_exception_filter_1.GlobalExceptionFilter,
            },
        ],
    })
], AppModule);
