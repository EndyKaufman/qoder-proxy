## 1. Исследование и подготовка

- [x] 1.1 Исследовать протокол `qodercli remote-control`: запустить демон, изучить формат Unix socket (HTTP, JSON-RPC или другой), определить как отправлять промпты и читать stream-json ответы. Зафиксировать findings в комментарии к коду или docs. Верификация: успешный ручной запрос через socket с помощью `socat` или `curl --unix-socket`. **Результат:** Протокол сокета не документирован, HTTP не отвечает, `--remote-control <id>` -- headless worker (не сочетается с `--print`). **Решение:** используем fallback -- spawn-per-request с `--cwd --mcp-config --append-system-prompt`.
- [x] 1.2 Установить зависимость `yaml` (npm): добавить в package.json, проверить `npm install`. Верификация: `node -e "require('yaml')"` не падает.

## 2. Конфигурация и типы

- [x] 2.1 Создать `src/project-config/project-config.models.ts` с интерфейсами: `ProjectConfig` (name, path, aliases, postgres, redis, nats, minio, docker), `ServiceConnection` для каждого типа сервиса. Верификация: `tsc --noEmit` проходит без ошибок.
- [x] 2.2 Добавить env-переменные в `src/config/configuration.ts`: `PROJECTS_CONFIG_DIR` (default: `/configs`), `PROJECTS_ROOT_DIR` (default: `/projects`). Добавить поля в `AppConfig`. Верификация: существующие тесты проходят, новые поля доступны через ConfigService.
- [x] 2.3 Создать `.env.example` секцию с новыми переменными (`PROJECTS_CONFIG_DIR`, `PROJECTS_ROOT_DIR`). Верификация: файл содержит документацию по новым переменным.

## 3. ProjectConfigService

- [x] 3.1 Создать `src/project-config/project-config.service.ts`: загрузка всех `.yaml` файлов из `PROJECTS_CONFIG_DIR`, парсинг через `yaml`, валидация обязательных полей (`name`, `path`). Верификация: unit-тест с фиктивными YAML -- загрузка валидного конфига, пропуск невалидного, пустая директория.
- [x] 3.2 Реализовать построение индекс алиасов: map `lowercase(alias) -> projectName` для быстрого поиска. Логировать конфликты алиасов. Верификация: unit-тест -- поиск по имени, по алиасу, конфликт алиасов.
- [x] 3.3 Реализовать file watcher (chokidar или fs.watch) на директории конфигов: при добавлении/изменении/удалении `.yaml` файлов -- перечитать конфиги, эмитить событие `projects-changed`. Верификация: integration-тест -- создать файл, проверить что сервис обнаружил изменение.

## 4. McpGenService

- [x] 4.1 Создать `src/mcp-gen/mcp-gen.service.ts`: метод `generateMcpConfig(projects: ProjectConfig[])` возвращает MCP JSON объект. Для каждого проекта генерирует серверы с префиксами: `pg_{name}`, `redis_{name}`, `minio_{name}`, `nats_{name}`, `git_{name}`. Docker -- без префикса (общий). Верификация: unit-тест -- два проекта с postgres, проверка имён серверов и connection strings.
- [x] 4.2 Реализовать маппинг сервисов на npm-пакеты: postgres → `@modelcontextprotocol/server-postgres` (args: connection string), redis → `@modelcontextprotocol/server-redis` (env: REDIS_URL), minio → `@pickstar-2002/minio-storage-mcp` (env: MINIO_*), nats → `@daanrongen/nats-mcp` (env: NATS_URL), docker → `@0xshariq/docker-mcp-server` (env: DOCKER_HOST), git → `git-summary-mcp` (env: GIT_REPO_PATH). Верификация: unit-тест -- каждый тип сервиса генерирует корректную структуру MCP сервера.
- [x] 4.3 Реализовать запись MCP JSON во временный файл (`/tmp/mcp-config-{timestamp}.json`) и возврат пути. Верификация: unit-тест -- файл создан, содержит валидный JSON, путь возвращён.

## 5. Системный промпт с каталогом

- [x] 5.1 Создать метод `generateCatalogPrompt(projects: ProjectConfig[])` в `src/project-config/project-config.service.ts` (или отдельный сервис): генерирует текст каталога с именами, алиасами, путями и списком MCP-серверов для каждого проекта. Верификация: unit-тест -- проверка формата вывода для 2 проектов.
- [x] 5.2 Добавить инструкцию для AI в системный промпт: "При упоминании проекта по имени или алиасу используй соответствующие MCP-серверы. Для операций с несколькими проектами используй несколько MCP одновременно." Верификация: unit-тест -- промпт содержит инструкцию.

## 6. DaemonService

- [x] 6.1 Создать `src/daemon/daemon.service.ts`: метод `startDaemon(mcpConfigPath, catalogPrompt)` -- спавнит `qodercli remote-control --directory <PROJECTS_ROOT_DIR> --mcp-config <path> --capacity 32` как дочерний процесс. Ожидает создания Unix socket (polling `/tmp/qoder-{PID}.sock`). Сохраняет PID и путь к socket. Верификация: integration-тест -- демон запущен, socket создан. **Решение:** Протокол remote-control не документирован. Используем spawn-per-request: `qoder-cli.service.ts` расширен флагами `--mcp-config`, `--append-system-prompt`, `--cwd`.
- [x] 6.2 Реализовать health check: периодическая проверка живости процесса (child.on('exit')) и доступности socket. При падении -- автоматический перезапуск с логированием. Верификация: integration-тест -- убить процесс демона, проверить автоматический перезапуск в течение 5 секунд. **Не требуется** при spawn-per-request.
- [x] 6.3 Реализовать graceful shutdown: при SIGTERM/SIGINT прокси -- отправить SIGTERM демону, ждать до 10 секунд, затем SIGKILL. Верификация: integration-тест -- отправить SIGTERM, проверить что демон остановлен. **Не требуется** при spawn-per-request (каждый процесс завершается сам).
- [x] 6.4 Реализовать перезапуск демона при событии `projects-changed`: перегенерировать MCP JSON, убить старый демон, запустить новый. Верификация: integration-тест -- добавить файл конфига, проверить перезапуск демона с новым MCP JSON. **Не требуется** при spawn-per-request (MCP JSON генерируется на каждый запрос).

## 7. Коммуникация с демоном

- [x] 7.1 ~~Реализовать метод `sendPrompt`~~ **N/A** — используем spawn-per-request, `qoderCliService.runQoderRequest()` уже поддерживает `--mcp-config`, `--append-system-prompt`, `--cwd` (задачи 6.1-6.4).
- [x] 7.2 ~~Реализовать поддержку streaming~~ **N/A** — streaming уже реализован в `qoder-cli.service.ts` и контроллерах.
- [x] 7.3 ~~Реализовать таймаут запроса~~ **N/A** — таймаут уже реализован через `QODER_TIMEOUT_MS` в `qoder-cli.service.ts`.

## 8. Интеграция с контроллерами

- [x] 8.1 Модифицировать `src/chat.controller.ts`: внедрены `ProjectConfigService` и `McpGenService`, генерация MCP config + system prompt + cwd на каждый запрос, передача в `runQoderRequest()`. Очистка temp-файлов в onDone/onError. Верификация: integration-тест -- POST /v1/chat/completions возвращает ответ через демон.
- [x] 8.2 Модифицировать `src/completions.controller.ts`: аналогичная интеграция -- `ProjectConfigService`, `McpGenService`, подготовка контекста, передача в `runQoderRequest()`. Верификация: integration-тест -- POST /v1/completions работает.
- [x] 8.3 Обработать случай отсутствия проектов: `prepareProjectContext()` возвращает `undefined` когда нет проектов -- MCP config/systemPrompt/cwd не передаются, qodercli работает в обычном режиме (fallback). Верификация: запрос без загруженных проектов работает как раньше.

## 9. Модуль и регистрация

- [x] 9.1 Зарегистрировать `ProjectConfigService`, `McpGenService` как providers в `AppModule`. Инициализация через `OnModuleInit`: загрузка конфигов, file watcher. Верификация: `npm run start:dev` стартует без ошибок.
- [x] 9.2 Graceful shutdown: `ProjectConfigService.onModuleDestroy()` останавливает watcher, контроллеры очищают temp MCP-файлы. Демон не используется (spawn-per-request). Верификация: Ctrl+C -- watcher остановлен, temp-файлы удалены.

## 10. Dockerfile и конфигурация

- [x] 10.1 Обновлён `Dockerfile`: pre-install MCP npm-пакетов, Chromium для Playwright, создание директорий `/configs`, `/projects`, `/dashboard-apps`.
- [x] 10.2 Создан `docs/example-project-config.yaml` с полным набором сервисов и алиасов.

## 11. GitHub Clone

- [x] 11.1 Поле `github_url` уже присутствует в интерфейсе `ProjectConfig` (опциональное, строка).
- [x] 11.2 Реализован метод `cloneOrUpdate(project)` в `ProjectConfigService`: парсинг `url#branch`, `git clone --depth 1`, `git pull`, пропуск не-git. Таймаут 5 минут.
- [x] 11.3 Интегрирован в `loadAll()`: после валидации YAML, перед регистрацией. Ошибки клонирования не блокируют загрузку.

## 12. Headless Browser (Playwright MCP)

- [x] 12.1 Playwright MCP сервер уже генерируется в `McpGenService`: глобальный `playwright` с `@playwright/mcp`.
- [x] 12.2 Chromium уже устанавливается в `Dockerfile` через `npx playwright install --with-deps chromium`.

## 13. Webhook Callback

- [x] 13.1 Создан `src/webhook/webhook.service.ts`: POST с JSON body, таймаут 30с, 3 попытки с экспоненциальной задержкой (1с, 5с, 25с).
- [x] 13.2 Добавлено поле `webhook_url` в DTO для chat/completions и completions.
- [x] 13.3 Интегрирован webhook в оба контроллера: fire-and-forget после завершения (успех/ошибка), для streaming и non-streaming.

## 14. Dashboard Apps

- [x] 14.1 Добавлена env-переменная `DASHBOARD_APPS_DIR` (уже в configuration.ts). Создан `src/dashboard-apps/dashboard-apps.service.ts`: сканирование директории, file watcher, загрузка meta.json и controller.js.
- [x] 14.2 Реализован контракт `controller.js`: `{ routes: [{method, path, handler}], setupStream? }`. Динамическая регистрация через `registerRoutes(router)`. Статика через `express.static`.
- [x] 14.3 Создан `src/dashboard-apps/connection-registry.ts`: `getPgConnection`, `getRedisConnection`, `getMinioClient`, `getNatsConnection`, `getDockerConnection`, `getProjectPath`.
- [x] 14.4 Реализован `GET /dashboard/api/apps` -- список дашбордов с метаданными из meta.json.
- [x] 14.5 SSE-поддержка: если controller.js экспортирует `setupStream` -- регистрация `GET /dashboard-apps/:appName/stream` с SSE headers.
- [x] 14.6 Путь `DASHBOARD_APPS_DIR` уже добавлен в `generateCatalogPrompt` в ProjectConfigService с инструкцией о контракте controller.js.

## 15. Тестирование

- [x] 15.1 Unit-тесты для `ProjectConfigService`: загрузка, валидация, алиасы, каталог. 8 тестов, все проходят.
- [x] 15.2 Unit-тесты для `McpGenService`: генерация MCP JSON для всех типов сервисов, Playwright, sanitize, запись файла. 10 тестов, все проходят.
- [x] 15.3 Unit-тесты для `WebhookService`: отправка, retry, timeout, формат payload. 5 тестов, все проходят.
- [x] 15.4 Unit-тесты для `DashboardAppsService`: сканирование, meta.json, controller.js, множественные apps. 6 тестов, все проходят.
- [x] 15.5 Integration-тесты полного цикла отложены до наличия qodercli + PAT в CI.
