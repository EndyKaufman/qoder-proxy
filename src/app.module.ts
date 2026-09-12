import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { ChatController } from './chat.controller';
import { CompletionsController } from './completions.controller';
import { ModelsController } from './models.controller';
import { DashboardController } from './dashboard.controller';
import { QoderCliService } from './qoder-cli/qoder-cli.service';
import { LogStoreService } from './log-store/log-store.service';
import { ProjectConfigService } from './project-config/project-config.service';
import { McpGenService } from './mcp-gen/mcp-gen.service';
import { WebhookService } from './webhook/webhook.service';
import { DashboardAppsService } from './dashboard-apps/dashboard-apps.service';
import { ConnectionRegistry } from './dashboard-apps/connection-registry';
import { PluginStorageService } from './plugin-storage/plugin-storage.service';
import { PluginLoaderService } from './plugin-manager/plugin-loader.service';
import { PluginCreationService } from './plugin-manager/plugin-creation.service';
import { PluginController } from './plugin-controller';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
  ],
  controllers: [
    AppController,
    ChatController,
    CompletionsController,
    ModelsController,
    DashboardController,
    PluginController,
  ],
  providers: [
    QoderCliService,
    LogStoreService,
    ProjectConfigService,
    McpGenService,
    WebhookService,
    DashboardAppsService,
    ConnectionRegistry,
    PluginStorageService,
    PluginLoaderService,
    PluginCreationService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('v1/*', 'dashboard/api/chat');
  }
}
