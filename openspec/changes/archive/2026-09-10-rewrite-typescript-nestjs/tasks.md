## 1. Каркас проекта и инструментарий

- [x] 1.1 Установить зависимости NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/swagger`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`) и dev-зависимости (`typescript`, `@nestjs/cli`, `ts-node`, `@types/node`, `@types/express`, `@types/uuid`) — проверить, что `npm install` завершается без ошибок. Примечание: `@nestjs/serve-static` пропущен (требует Express 5), используем `express.static` напрямую
- [x] 1.2 Обновить `tsconfig.json` (уже существует, покрывает `tests/**/*.ts`) — добавить `emitDecoratorMetadata: true`, `experimentalDecorators: true`, `outDir: dist`, `rootDir: src`, расширить `include` на `src/**/*.ts` — проверить, что `npx tsc --noEmit` проходит на пустом `src/main.ts`. Создан `tsconfig.build.json` для сборки (extends base, rootDir: src, outDir: dist)
- [x] 1.3 Создать `nest-cli.json` с `sourceRoot: "src"`, `compilerOptions.outDir: "dist"`, `compilerOptions.assets` для копирования `dashboard/public/**` в `dist/` — проверить, что `npx nest build` создаёт `dist/main.js`
- [x] 1.4 Обновить скрипты `package.json`: `build` → `nest build`, `start` → `node dist/main`, `start:dev` → `nest start --watch`, `start:debug` → `nest start --debug --watch` — проверить, что `npm run build` проходит успешно

## 2. Утилиты и модели (shared)

- [x] 2.1 Создать `src/qoder-cli/qoder-cli.models.ts` — экспортировать массив `QODER_MODELS`, карту `QODER_MODEL_BY_ID`, карту `ALIAS_MAP`, функцию `getModelMapping()` и тип `ModelCatalogEntry` — проверить, что компилируется
- [x] 2.2 Создать `src/utils/format.ts` — экспортировать `messagesToPrompt()`, `extractTextContent()`, `newId()`, `buildStreamChunk()`, `buildDoneChunk()`, `buildFullChatResponse()`, `buildFullChatResponseWithTools()`, `buildToolCallStreamChunk()`, `buildCompletionStreamChunk()`, `buildFullCompletionResponse()`, `extractToolCalls()` — проверить, что компилируется
- [x] 2.3 Создать `src/utils/tool-prompt.ts` — чистые функции `buildToolSystemPrompt()`, `buildPromptWithTools()`, `parseToolCallFromText()`, `toOpenAIToolCalls()` с TypeScript сигнатурами — проверить, что компилируется

## 3. Конфигурация

- [x] 3.1 Создать `src/config/configuration.ts` — типизированная фабричная функция, возвращающая интерфейс `AppConfig` со всеми текущими переменными окружения (`PORT`, `API_KEY`, `CORS_ORIGIN`, `QODER_TIMEOUT_MS`, `QODER_MAX_OUTPUT_TOKENS`, `QODER_PAT`, `PUBLIC_BASE_URL`, `DASHBOARD_ENABLED`, `DASHBOARD_PASSWORD`, `DASHBOARD_SECRET`, `LOG_MAX_ENTRIES`, `LOG_BODY_MAX_BYTES`) с сохранением текущих значений по умолчанию — проверить, что компилируется

## 4. Сервисы (только реальное переиспользование)

- [x] 4.1 Создать `src/log-store/log-store.service.ts` — `@Injectable()` сервис с методами `addRequest()`, `addSystem()`, `getRequests()`, `getSystem()`, `clearRequests()`, `clearSystem()`, использующий `ConfigService` для `LOG_MAX_ENTRIES` и `LOG_BODY_MAX_BYTES`, с сохранением текущей логики обрезки и генерации UUID — проверить, что компилируется
- [x] 4.2 Создать `src/qoder-cli/qoder-cli.service.ts` — `@Injectable()` сервис с методами `runQoderRequest()` (возвращает `ChildProcess`), `checkQoderCli()` (возвращает `Promise<string | null>`), `getQoderCliCommand()`, `qoderEnv()`, а также все внутренние хелперы (`parseStreamJsonLine`, `hasVisibleAssistantText`, `deepFindText`, `extractEventText`, `isBenignQoderStderr`) — внедрить `LogStoreService` для вызовов системных логов и `ConfigService` для timeout/PAT — проверить, что компилируется

## 5. Общие middleware, guard'ы и фильтры

- [x] 5.1 Создать `src/common/guards/api-key.guard.ts` — `ApiKeyGuard` реализующий `CanActivate`, читает `API_KEY` из `ConfigService`, пропускает если null, валидирует `Bearer` токен в противном случае, возвращает ошибку 401 в формате OpenAI при неудаче — проверить, что компилируется
- [x] 5.2 Создать `src/common/guards/dashboard-auth.guard.ts` — cookie-based guard, повторяющий текущую логику `dashboardAuth.js` (`createToken`, `verifyToken`, `setCookie`, `clearCookie`, HMAC-SHA256 подпись) — проверить, что компилируется
- [x] 5.3 Создать `src/common/middleware/logger.middleware.ts` — функциональный middleware, повторяющий текущее поведение `logger.js` (перехватывает `res.json()` и `res.write()`, логирует в консоль и `LogStoreService`), применяется только к путям `/v1/*` и чата дашборда — проверить, что компилируется
- [x] 5.4 Создать `src/common/filters/global-exception.filter.ts` — `GlobalExceptionFilter` реализующий `ExceptionFilter`, возвращает JSON ошибки в формате OpenAI со stack trace в non-production — проверить, что компилируется

## 6. Контроллеры (DTO с OpenAPI-декораторами прямо в файлах)

- [x] 6.1 Создать `src/app.controller.ts` — `@Controller()` с `@ApiTags('root')`: `GET /` возвращающий JSON-объект с информацией, `GET /health` возвращающий статус qodercli. DTO-ответов с `@ApiProperty()` — проверить, что компилируется
- [x] 6.2 Создать `src/chat.controller.ts` — `@Controller('v1/chat/completions')` с `@ApiTags('chat')`, `@UseGuards(ApiKeyGuard)`. GET обработчик возвращающий ошибку 400. POST обработчик использующий `@Res()` для стриминга/не-стриминга. Логика стриминга прямо в контроллере (без отдельного сервиса). DTO: `ChatCompletionRequestDto` с `@ApiProperty()` для `messages`, `model`, `stream`, `temperature`, `max_tokens`, `tools`, `tool_choice` — проверить, что компилируется
- [x] 6.3 Создать `src/completions.controller.ts` — `@Controller('v1/completions')` с `@ApiTags('completions')`, `@UseGuards(ApiKeyGuard)`. POST обработчик с `@Res()` для стриминга/не-стриминга. Логика прямо в контроллере. DTO: `CompletionRequestDto` с `@ApiProperty()` для `prompt`, `model`, `stream`, `temperature`, `max_tokens` — проверить, что компилируется
- [x] 6.4 Создать `src/models.controller.ts` — `@Controller('v1')` с `@ApiTags('models')`, `@UseGuards(ApiKeyGuard)`: `GET /models` возвращающий список моделей в формате OpenAI с `OPENAI_ALIASES`, `POST /embeddings` возвращающий 501, catch-all возвращающий 404 — проверить, что компилируется
- [x] 6.5 Создать `src/dashboard.controller.ts` — `@Controller('dashboard')` с `@ApiTags('dashboard')`: публичные маршруты (login GET/POST, logout), auth wall через `DashboardAuthGuard`, SPA shell маршрут, API маршруты (`/api/config`, `/api/status`, `/api/models`, `/api/chat`, `/api/logs`, `/api/logs/system`). Логика прямо в контроллере — проверить, что компилируется

## 7. AppModule и bootstrap

- [x] 7.1 Создать `src/app.module.ts` — единственный модуль, декорированный `@Module()`: `imports` — `ConfigModule.forRoot({ load: [configuration], isGlobal: true })`, `ServeStaticModule.forRoot(...)`. `providers` — `QoderCliService`, `LogStoreService`. `controllers` — `AppController`, `ChatController`, `CompletionsController`, `ModelsController`, `DashboardController`. Применить `LoggerMiddleware` глобально для `/v1/*`, зарегистрировать `GlobalExceptionFilter` — проверить, что компилируется
- [x] 7.2 Создать `src/main.ts` — bootstrap через `NestFactory.create(AppModule)`, включить CORS из конфига, настроить Swagger (`SwaggerModule.createDocument` + `SwaggerModule.setup('api/docs', app, document)`), применить `express.json({ limit: '10mb' })` и `express.urlencoded({ extended: true })`, выполнить стартовые проверки (версия qodercli, предупреждения об отсутствующих переменных окружения) — проверить, что `npm run build && npm start` запускается, `GET /health` отвечает, Swagger доступен по `/api/docs`

## 8. Статические ресурсы дашборда

- [x] 8.1 Статические файлы `src/dashboard/public/` (index.html, app.js, style.css) остаются на месте — проверить, что они корректно отдаются по `/dashboard/static/*` после сборки (конфигурация `assets` в `nest-cli.json` копирует нетипизированные файлы в `dist/`)

## 9. Миграция unit-тестов на TypeScript

- [x] 9.1 Переписать `tests/unit/helpers/format.test.js` → `format.test.ts` — заменить `require()` на типизированные `import` из `src/utils/format` и `src/qoder-cli/qoder-cli.models`, добавить типы для тестовых данных — проверить, что тест проходит
- [x] 9.2 Переписать `tests/unit/helpers/spawn.test.js` → `spawn.test.ts` — заменить `require()` на типизированные `import` из `src/qoder-cli/qoder-cli.service`, обновить `jest.mock()` пути — проверить, что тест проходит
- [x] 9.3 Переписать `tests/unit/helpers/toolPrompt.test.js` → `toolPrompt.test.ts` — заменить `require()` на типизированные `import` из `src/utils/tool-prompt` — проверить, что тест проходит
- [x] 9.4 Переписать `tests/unit/middleware/auth.test.js` → `auth.test.ts` — заменить `require()` на типизированные `import` из `src/common/guards/api-key.guard`, адаптировать под NestJS guard API — проверить, что тест проходит
- [x] 9.5 Переписать `tests/unit/middleware/dashboardAuth.test.js` → `dashboardAuth.test.ts` — заменить `require()` на типизированные `import` из `src/common/guards/dashboard-auth.guard` — проверить, что тест проходит
- [x] 9.6 Переписать `tests/unit/middleware/logger.test.js` → `logger.test.ts` — заменить `require()` на типизированные `import` из `src/common/middleware/logger.middleware` — проверить, что тест проходит
- [x] 9.7 Переписать `tests/unit/store/logStore.test.js` → `logStore.test.ts` — заменить `require()` на типизированные `import` из `src/log-store/log-store.service` — проверить, что тест проходит
- [x] 9.8 Удалить старые JS unit-тесты (`tests/unit/**/*.test.js`) — проверить, что `npm test` находит только `.test.ts` файлы и все проходят

## 10. Dockerfile и очистка

- [x] 10.1 Обновить `Dockerfile` — добавить `npm ci` (полную, включая dev зависимости) + стадию `npm run build`, изменить `CMD` на `["node", "dist/main.js"]`, обновить healthcheck для использования точки входа `dist/main.js` — проверить, что `docker build` проходит успешно
- [x] 10.2 Обновить `.dockerignore` для исключения `dist/`, `node_modules/`, `.env` — проверить, что контекст сборки чистый
- [x] 10.3 Удалить старые JavaScript исходные файлы (`src/server.js`, `src/config.js`, `src/routes/*.js`, `src/middleware/*.js`, `src/helpers/*.js`, `src/store/*.js`) — проверить, что `npm run build` по-прежнему проходит успешно и `npm start` обслуживает все конечные точки корректно
- [x] 10.4 Провести полную интеграционную проверку: `GET /` возвращает info JSON, `GET /health` возвращает статус, `GET /v1/models` возвращает список моделей, `POST /v1/chat/completions` с `stream: true` возвращает SSE поток, `POST /v1/completions` работает, дашборд по `/dashboard/` загружается, Swagger по `/api/docs` открывается — проверить, что все ответы совпадают с форматом до миграции в точности
- [x] 10.5 Запустить `npm test` — все 160 тестов (7 integration + 7 unit suites) должны пройти без изменений, подтверждая сохранение контрактов
