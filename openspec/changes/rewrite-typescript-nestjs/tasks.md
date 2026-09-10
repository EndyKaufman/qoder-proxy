## 1. Каркас проекта и инструментарий

- [ ] 1.1 Установить зависимости NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/serve-static`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`) и dev-зависимости (`typescript`, `@nestjs/cli`, `ts-node`, `@types/node`, `@types/express`, `@types/uuid`) — проверить, что `npm install` завершается без ошибок
- [ ] 1.2 Создать `tsconfig.json` с `strict: true`, `emitDecoratorMetadata: true`, `experimentalDecorators: true`, `target: ES2021`, `module: commonjs`, `outDir: dist`, `rootDir: src`, `paths` для `@common/*` — проверить, что `npx tsc --noEmit` проходит на пустом `src/main.ts`
- [ ] 1.3 Создать `nest-cli.json` с `sourceRoot: "src"`, `compilerOptions.outDir: "dist"` — проверить, что `npx nest build` создаёт `dist/main.js`
- [ ] 1.4 Обновить скрипты `package.json`: `build` → `nest build`, `start` → `node dist/main`, `start:dev` → `nest start --watch`, `start:debug` → `nest start --debug --watch` — проверить, что `npm run build` проходит успешно

## 2. TypeScript интерфейсы и типы

- [ ] 2.1 Создать `src/common/interfaces/openai.interfaces.ts` с типами `ChatCompletionRequest`, `ChatCompletionResponse`, `ChatCompletionChunk`, `CompletionRequest`, `CompletionResponse`, `CompletionChunk`, `ModelListResponse`, `ModelObject`, `ToolCall`, `ToolDefinition`, `Message` (с union для role), `ErrorResponse` — проверить, что файл компилируется через `npx tsc --noEmit`
- [ ] 2.2 Создать `src/common/interfaces/qoder.interfaces.ts` с типами `QoderMessage`, `QoderContentPart`, `QoderStreamEvent`, `QoderToolCallContent`, `RunQoderRequestOptions` — проверить, что файл компилируется

## 3. Модуль конфигурации

- [ ] 3.1 Создать `src/config/configuration.ts` — типизированная фабричная функция, возвращающая интерфейс `AppConfig` со всеми текущими переменными окружения (`PORT`, `API_KEY`, `CORS_ORIGIN`, `QODER_TIMEOUT_MS`, `QODER_MAX_OUTPUT_TOKENS`, `QODER_PAT`, `PUBLIC_BASE_URL`, `DASHBOARD_ENABLED`, `DASHBOARD_PASSWORD`, `DASHBOARD_SECRET`, `LOG_MAX_ENTRIES`, `LOG_BODY_MAX_BYTES`) с сохранением текущих значений по умолчанию — проверить, что компилируется
- [ ] 3.2 Создать `src/config/config.module.ts` с импортом `ConfigModule.forRoot({ load: [configuration], isGlobal: true })` — проверить, что компилируется

## 4. Модуль хранилища логов

- [ ] 4.1 Создать `src/log-store/log-store.service.ts` — injectable сервис с методами `addRequest()`, `addSystem()`, `getRequests()`, `getSystem()`, `clearRequests()`, `clearSystem()`, использующий `ConfigService` для `LOG_MAX_ENTRIES` и `LOG_BODY_MAX_BYTES`, с сохранением текущей логики обрезки и генерации UUID — проверить, что компилируется
- [ ] 4.2 Создать `src/log-store/log-store.module.ts` с экспортом `LogStoreService` как глобального — проверить, что компилируется

## 5. Модуль Qoder CLI

- [ ] 5.1 Создать `src/qoder-cli/qoder-cli.models.ts` — экспортировать массив `QODER_MODELS`, карту `QODER_MODEL_BY_ID`, карту `ALIAS_MAP`, функцию `getModelMapping()` и интерфейс `ModelCatalogEntry` — проверить, что компилируется
- [ ] 5.2 Создать `src/qoder-cli/qoder-cli.service.ts` — injectable сервис с методами `runQoderRequest()` (возвращает `ChildProcess`), `checkQoderCli()` (возвращает `Promise<string | null>`), `getQoderCliCommand()`, `qoderEnv()`, а также все внутренние хелперы (`parseStreamJsonLine`, `hasVisibleAssistantText`, `deepFindText`, `extractEventText`, `isBenignQoderStderr`) — внедрить `LogStoreService` для вызовов системных логов и `ConfigService` для timeout/PAT — проверить, что компилируется
- [ ] 5.3 Создать `src/qoder-cli/qoder-cli.module.ts` с экспортом `QoderCliService` — проверить, что компилируется

## 6. Общие middleware, guard'ы и фильтры

- [ ] 6.1 Создать `src/common/guards/api-key.guard.ts` — `ApiKeyGuard` реализующий `CanActivate`, читает `API_KEY` из `ConfigService`, пропускает если null, валидирует `Bearer` токен в противном случае, возвращает ошибку 401 в формате OpenAI при неудаче — проверить, что компилируется
- [ ] 6.2 Создать `src/common/middleware/logger.middleware.ts` — функциональный middleware, повторяющий текущее поведение `logger.js` (перехватывает `res.json()` и `res.write()`, логирует в консоль и `LogStoreService`), применяется только к путям `/v1/*` и чата дашборда — проверить, что компилируется
- [ ] 6.3 Создать `src/common/filters/global-exception.filter.ts` — `GlobalExceptionFilter` реализующий `ExceptionFilter`, возвращает JSON ошибки в формате OpenAI со stack trace в non-production — проверить, что компилируется

## 7. Модуль чата

- [ ] 7.1 Создать `src/chat/tool-prompt.util.ts` — чистые функции `buildToolSystemPrompt()`, `buildPromptWithTools()`, `parseToolCallFromText()`, `toOpenAIToolCalls()` с TypeScript сигнатурами — проверить, что компилируется
- [ ] 7.2 Создать `src/chat/chat.service.ts` — injectable сервис с методами `handleStreamChat()` и `handleNonStreamChat()`, инкапсулирующими всю текущую POST-логику `chat.js` (построение промпта через `messagesToPrompt` + инъекция tools, вызовы `runQoderRequest`, сборка SSE-чанков, обнаружение tool calls из текста стрима, обработка отключения клиента). Внедрить `QoderCliService`, `LogStoreService`, `ConfigService`. Экспортировать `messagesToPrompt()`, `extractTextContent()`, `newId()` и все функции построения ответов (`buildStreamChunk`, `buildDoneChunk`, `buildFullChatResponse`, `buildFullChatResponseWithTools`, `buildToolCallStreamChunk`) — проверить, что компилируется
- [ ] 7.3 Создать `src/chat/chat.controller.ts` — `@Controller('v1/chat/completions')` с `@UseGuards(ApiKeyGuard)`, GET обработчик возвращающий ошибку 400, POST обработчик использующий `@Res()` для стриминга/не-стриминга в зависимости от флага `stream` — проверить, что компилируется
- [ ] 7.4 Создать `src/chat/chat.module.ts` с импортом `QoderCliModule`, `LogStoreModule` — проверить, что компилируется

## 8. Модуль completions

- [ ] 8.1 Создать `src/completions/completions.service.ts` — injectable сервис с методами `handleStreamCompletion()` и `handleNonStreamCompletion()`, повторяющими текущую логику `completions.js` — проверить, что компилируется
- [ ] 8.2 Создать `src/completions/completions.controller.ts` — `@Controller('v1/completions')` с `@UseGuards(ApiKeyGuard)`, POST обработчик — проверить, что компилируется
- [ ] 8.3 Создать `src/completions/completions.module.ts` — проверить, что компилируется

## 9. Модуль моделей

- [ ] 9.1 Создать `src/models/models.controller.ts` — `@Controller('v1')` с `@UseGuards(ApiKeyGuard)`: `GET /models` возвращающий список моделей в формате OpenAI с `OPENAI_ALIASES`, `POST /embeddings` возвращающий 501, catch-all возвращающий 404 — проверить, что компилируется
- [ ] 9.2 Создать `src/models/models.module.ts` — проверить, что компилируется

## 10. Модуль дашборда

- [ ] 10.1 Создать `src/dashboard/guards/dashboard-auth.guard.ts` — cookie-based guard, повторяющий текущую логику `dashboardAuth.js` (`createToken`, `verifyToken`, `setCookie`, `clearCookie`, HMAC-SHA256 подпись) — проверить, что компилируется
- [ ] 10.2 Создать `src/dashboard/dashboard.service.ts` — injectable сервис с методами `getPublicConfig()`, `getStatus()`, `getModels()`, `handlePlaygroundChat()` — проверить, что компилируется
- [ ] 10.3 Создать `src/dashboard/dashboard.controller.ts` — `@Controller('dashboard')` с публичными маршрутами (login GET/POST, logout), auth wall через `DashboardAuthGuard`, SPA shell маршрут, API маршруты (`/api/config`, `/api/status`, `/api/models`, `/api/chat`, `/api/logs`, `/api/logs/system`) — проверить, что компилируется
- [ ] 10.4 Создать `src/dashboard/dashboard.module.ts` с импортом `ServeStaticModule` для `src/dashboard/public` на `/dashboard/static`, а также `QoderCliModule`, `LogStoreModule` — проверить, что компилируется

## 11. Корневой модуль и bootstrap

- [ ] 11.1 Создать `src/app.controller.ts` — корневой `GET /` возвращающий JSON-объект с информацией, `GET /health` возвращающий статус qodercli — проверить, что компилируется
- [ ] 11.2 Создать `src/app.module.ts` — корневой модуль с импортом `ConfigModule`, `LogStoreModule`, `QoderCliModule`, `ChatModule`, `CompletionsModule`, `ModelsModule`, `DashboardModule`, применяющий `LoggerMiddleware` глобально для путей `/v1/*`, регистрирующий `GlobalExceptionFilter` — проверить, что компилируется
- [ ] 11.3 Создать `src/main.ts` — bootstrap через `NestFactory.create(AppModule)`, включить CORS из конфига, установить global prefix `''`, применить `express.json({ limit: '10mb' })` и `express.urlencoded({ extended: true })`, вызвать `app.init()` затем выполнить стартовые проверки (версия qodercli, предупреждения об отсутствующих переменных окружения), соответствующие текущей логике запуска `server.js` — проверить, что `npm run build && npm start` запускается и отвечает на `GET /health`

## 12. Статические ресурсы дашборда

- [ ] 12.1 Статические файлы `src/dashboard/public/` (index.html, app.js, style.css) остаются на месте — проверить, что они корректно отдаются по `/dashboard/static/*` после сборки (в `nest-cli.json` должна быть конфигурация `assets` для копирования нетипизированных файлов в `dist/`)

## 13. Dockerfile и очистка

- [ ] 13.1 Обновить `Dockerfile` — добавить `npm ci` (полную, включая dev зависимости) + стадию `npm run build`, изменить `CMD` на `["node", "dist/main.js"]`, обновить healthcheck для использования точки входа `dist/main.js` — проверить, что `docker build` проходит успешно
- [ ] 13.2 Обновить `.dockerignore` для исключения `dist/`, `node_modules/`, `.env` — проверить, что контекст сборки чистый
- [ ] 13.3 Удалить старые JavaScript исходные файлы (`src/server.js`, `src/config.js`, `src/routes/*.js`, `src/middleware/*.js`, `src/helpers/*.js`, `src/store/*.js`) — проверить, что `npm run build` по-прежнему проходит успешно и `npm start` обслуживает все конечные точки корректно
- [ ] 13.4 Провести полную интеграционную проверку: `GET /` возвращает info JSON, `GET /health` возвращает статус, `GET /v1/models` возвращает список моделей, `POST /v1/chat/completions` с `stream: true` возвращает SSE поток, `POST /v1/completions` работает, дашборд по `/dashboard/` загружается — проверить, что все ответы совпадают с форматом до миграции в точности
