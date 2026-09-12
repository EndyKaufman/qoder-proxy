## 1. Зависимости

- [x] 1.1 Установить `better-sqlite3`: `npm install better-sqlite3`. Проверить что `npm ls better-sqlite3` показывает пакет.

- [x] 1.2 Установить testcontainers: `npm install --save-dev testcontainers @testcontainers/postgresql @testcontainers/redis`. Проверить что `npm ls testcontainers` показывает пакеты.

- [x] 1.3 Добавить MCP пакеты в Dockerfile: `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch`, `@modelcontextprotocol/server-sqlite`. Проверить что Dockerfile содержит все три пакета.

## 2. Plugin Storage (SQLite)

- [x] 2.1 Создать `src/plugin-storage/plugin-storage.models.ts` — интерфейсы Plugin, PluginVersion, PluginActive. Проверить что `npx tsc --noEmit` проходит.

- [x] 2.2 Создать `src/plugin-storage/plugin-storage.service.ts` — SQLite подключение (`better-sqlite3`), создание таблиц (plugins, plugin_versions с колонкой openapi_spec TEXT, plugin_active, plugin_data), CRUD: `createPlugin()`, `getPlugin()`, `getAllPlugins()`, `createVersion(prompt, files, openApiSpec?)`, `getVersions()`, `getActiveVersion()`, `setActiveVersion()`, `rollback()`. Универсальное хранилище: `setData(pluginId, key, value)`, `getData(pluginId, key)`, `deleteData(pluginId, key)`, `listData(pluginId)`. Файлы хранятся в `files_json` (колонка TEXT с JSON содержимым всех файлов). Путь к БД из env `PLUGINS_DB_PATH` (default: `/data/plugins.db`). Проверить что юнит-тест на in-memory SQLite проходит (create + read + version + rollback + data set/get + openapi_spec сохранение).

- [x] 2.3 Добавить `PLUGINS_DB_PATH` и `PLUGINS_FILES_DIR` в `src/config/configuration.ts` и `.env.example`. Проверить что `npx tsc --noEmit` проходит.

## 3. Plugin Validation

- [x] 3.1 Создать `src/plugin-manager/plugin-validator.ts` — функции: `validateHtml(content)`, `validateJsSyntax(filePath)` (через `node --check`), `validateControllerContract(filePath)` (require -> routes массив, meta объект), `validateOpenApiSpec(routes, openApiYaml)` (проверка что все paths из спеки реализованы), `generateOpenApiFromRoutes(routes, meta)` (автогенерация OpenAPI из routes если спека не предоставлена). Каждая возвращает `{valid: boolean, errors: string[]}` или сгенерированную спеку. Проверить что юнит-тесты проходят (валидный/невалидный HTML, JS, controller, OpenAPI, auto-spec генерация).

- [x] 3.2 Создать `src/plugin-manager/plugin-fix-loop.ts` — логика цикла автоисправления: `runFixLoop(files, errors, maxFixAttempts=3, maxRegenAttempts=3)` — возвращает `{success: boolean, files?, prompt?}`. Функция формирует промпт для починки (с ошибками) и промпт для перегенерации. Проверить что юнит-тест проверяет формирование промптов.

## 4. Plugin Loader

- [x] 4.1 Создать `src/plugin-manager/plugin-loader.service.ts` — OnModuleInit: загрузка всех активных плагинов из SQLite. Для каждого: если файлов нет на диске — восстановить из `files_json` в БД. Открыть отдельную SQLite БД для плагина: `/data/plugins/:slug/data.db` (через `better-sqlite3`). `require(controller.js)` -> `init({pg, redis, minio, storage, db})` где storage — key-value хранилище привязанное к plugin_id через PluginStorageService, db — отдельная SQLite для данных плагина. Регистрация Express sub-routes на `/plugins/:slug/`. Раздача статики через `express.static`. File watcher на `/data/plugins/` для hot-reload. Проверить что плагин загружается и его маршруты работают.

- [x] 4.2 Создать `src/plugin-manager/plugin-creation.service.ts` — `createPlugin(prompt, projectContext, openApiSpec?)` — спавнит qodercli с MCP (filesystem, fetch, sqlite) + системный промпт с контрактом плагина. Если предоставлена OpenAPI спека — включить в промпт как контракт. Парсит stdout для извлечения созданных файлов. Если спека не предоставлена — генерирует auto-spec из routes через `generateOpenApiFromRoutes()`. Сохраняет в SQLite (files_json + openapi_spec) + файловую систему. Запускает валидацию + fix loop. Загружает плагин. Проверить что юнит-тест с моком qodercli проходит.

## 5. Plugin API Controller

- [x] 5.1 Создать `src/plugin-controller.ts` — NestJS controller:
  - `GET /plugins/api/list` -> `[{slug, name, description, version, url}]`
  - `GET /plugins/api/:slug` -> `{plugin, versions: [{version, prompt, created_at}]}`
  - `GET /plugins/api/:slug/:version` -> `{version, prompt, files}`
  - `POST /plugins/api/:slug/rollback` -> откат на предыдущую версию
  
  Проверить что `npx tsc --noEmit` проходит.

## 6. MCP и System Prompt интеграция

- [x] 6.1 Обновить `src/mcp-gen/mcp-gen.service.ts` — добавить глобальные MCP серверы: `filesystem` (cwd проекта), `fetch` (HTTP), `sqlite` (plugins.db путь). Проверить что `generateMcpConfig()` включает эти серверы.

- [x] 6.2 Обновить `src/project-config/project-config.service.ts` — `generateCatalogPrompt()` включает секцию `## Available Plugins` со списком плагинов из PluginStorageService (slug, name, description, URL). Проверить что промпт содержит данные плагина.

- [x] 6.3 Обновить `src/chat.controller.ts` и `src/completions.controller.ts` — после завершения qodercli, проверить stdout на наличие созданных файлов плагина (паттерн: запись в `/data/plugins/`). Если найдены — вызвать `pluginCreationService.interceptAndSave()`. Проверить что `npx tsc --noEmit` проходит.

## 7. Модули и регистрация

- [x] 7.1 Обновить `src/app.module.ts` — добавить providers: PluginStorageService, PluginLoaderService, PluginCreationService, PluginValidator (если нужен). Проверить что `npx tsc --noEmit` проходит.

## 8. Docker

- [x] 8.1 Обновить `Dockerfile` — добавить `RUN mkdir -p /data` и `VOLUME /data`. Проверить что Dockerfile содержит директиву VOLUME.

- [x] 8.2 Создать `docker-compose.yml` — сервис qoder-proxy с volumes: `./data:/data`, `./configs:/configs`. Environment: PLUGINS_DB_PATH, PLUGINS_FILES_DIR, PROJECTS_CONFIG_DIR. Проверить что `docker-compose config` валиден.

## 9. E2E тесты: Setup

- [x] 9.1 Создать `tests/e2e/setup.ts` — `startContainers()` (PostgreSQL + Redis через testcontainers), `buildE2EApp()` (NestJS app без моков, с env vars), `stopContainers()`. Проверить что `npx tsc --noEmit` проходит.

- [x] 9.2 Создать `tests/e2e/fixtures/` — `project-configs/alpha.yaml` (PG + Redis с placeholder портами), `sample-projects/alpha/README.md`. Проверить что файлы существуют.

- [x] 9.3 Создать `tests/e2e/fixtures/openapi/universal-search.yaml` — OpenAPI спека для Universal Search плагина (endpoints: POST /search, GET /search/more, POST /search/save, GET /search/saved, DELETE /search/saved/:id). Проверить что YAML валидный.

- [x] 9.4 Создать `tests/e2e/fixtures/openapi/photo-gallery.yaml` — OpenAPI спека для Photo Gallery плагина (endpoints: GET /photos с пагинацией и поиском, POST /photos возвращает presigned upload URL, GET /photos/:id возвращает presigned download URL, PUT /photos/:id, DELETE /photos/:id). Файлы загружаются/скачиваются напрямую через MinIO presigned URLs, бэкенд не перегоняет файлы. Проверить что YAML валидный.

## 10. E2E тесты: Plugin Storage

- [x] 10.1 Создать `tests/e2e/plugin-system.e2e.test.ts` — describe `Plugin Storage`. Тест: создание плагина через PluginStorageService, проверка что `getAllPlugins()` возвращает массив с созданным. Проверить что тест проходит.

- [x] 10.2 Тест: создание версии, проверка `getVersions()` возвращает версию с промптом. Проверить что тест проходит.

- [x] 10.3 Тест: rollback — создать 2 версии, откатить, проверить что `getActiveVersion()` возвращает первую. Проверить что тест проходит.

- [x] 10.4 Тест: plugin_data — `setData(pluginId, 'settings', {theme: 'dark'})`, `getData(pluginId, 'settings')` возвращает JSON, `listData(pluginId)` возвращает массив ключей. Проверить что тест проходит.

## 11. E2E тесты: Plugin Validation

- [x] 11.1 Describe `Plugin Validation`. Тест: валидный HTML + JS + controller.js проходят валидацию. Проверить что тест проходит.

- [x] 11.2 Тест: невалидный JS (синтаксическая ошибка) — валидация возвращает errors. Проверить что тест проходит.

- [x] 11.3 Тест: controller.js без routes — валидация возвращает ошибку контракта. Проверить что тест проходит.

## 12. E2E тесты: Plugin Loader

- [x] 12.1 Describe `Plugin Loader`. Тест: загрузка плагина из фикстуры — `init()` вызван, маршруты зарегистрированы. Проверить что тест проходит.

- [x] 12.2 Тест: GET `/plugins/sql-manager/` отдаёт index.html. Проверить что тест проходит.

- [x] 12.3 Тест: POST `/plugins/sql-manager/query` с `{sql: "SELECT 1+1 as result"}` — ответ от PG контейнера `{result: [{result: 2}]}`. Проверить что тест проходит.

## 13. E2E тесты: Plugin API

- [x] 13.1 Describe `Plugin API`. Тест: GET `/plugins/api/list` — возвращает массив с загруженным плагином. Проверить что тест проходит.

- [x] 13.2 Тест: GET `/plugins/api/sql-manager` — возвращает версии с промптом. Проверить что тест проходит.

- [x] 13.3 Тест: POST `/plugins/api/sql-manager/rollback` — откат, проверка что активная версия изменилась. Проверить что тест проходит.

## 14. E2E тесты: Redis Cache

- [x] 14.1 Describe `Redis Cache`. Тест: первый POST query -> `cached: false`, второй с тем же SQL -> `cached: true`. Проверить что тест проходит.

## 15. E2E тесты: System Prompt

- [x] 15.1 Describe `System Prompt`. Тест: `generateCatalogPrompt()` содержит `## Available Plugins`, slug, name, URL плагина. Проверить что тест проходит.

## 16. E2E тесты: LLM Plugin List

- [x] 16.1 Describe `LLM Plugin List`. Тест: `GET /plugins/api/list` возвращает данные которые LLM может использовать для ответа "какие есть приложения" (slug, name, description, url). Проверить что тест проходит.

## 17. E2E тесты: Universal Search Plugin (через qodercli)

- [x] 17.1 Describe `Universal Search Plugin`. Тест: создание плагина через qodercli с OpenAPI спекой (universal-search.yaml). Проверить что плагин создан в SQLite (files_json содержит meta.json, index.html, controller.js). Проверить что тест проходит (требует qodercli + PAT).

- [x] 17.2 Тест: проверка что созданный плагин соответствует OpenAPI спеке — все endpoints из спеки присутствуют в routes (POST /search, GET /search/more, POST /search/save, GET /search/saved, DELETE /search/saved/:id). Проверить что тест проходит.

- [x] 17.3 Тест: POST /plugins/universal-search/search с `{query: "test"}` — проверка что результат содержит данные из PG (через MCP pg_alpha). Проверить что тест проходит.

- [x] 17.4 Тест: сохранение поиска — POST /plugins/universal-search/save, проверка что storage.set() вызван, GET /plugins/universal-search/saved возвращает сохранённый поиск. Проверить что тест проходит.

- [x] 17.5 Тест: "load more" — GET /plugins/universal-search/more с параметрами limit/offset, проверка что возвращаются дополнительные результаты. Проверить что тест проходит.

- [x] 17.6 Тест: persistence — удалить плагин из Redis/PG, проверить что сохранённый поиск всё ещё доступен через storage. Проверить что тест проходит.

## 18. E2E тесты: Photo Gallery Plugin (через qodercli)

- [x] 18.1 Describe `Photo Gallery Plugin`. Тест: создание плагина через qodercli с OpenAPI спекой (photo-gallery.yaml). Проверить что плагин создан в SQLite (files_json содержит meta.json, index.html, controller.js). Проверить что тест проходит (требует qodercli + PAT).

- [x] 18.2 Тест: проверка что плагин соответствует OpenAPI спеке — все endpoints присутствуют (GET /photos, POST /photos, GET /photos/:id, PUT /photos/:id, DELETE /photos/:id). Проверить что тест проходит.

- [x] 18.3 Тест: POST /plugins/photo-gallery/photos с {filename, contentType, description} -> 201, возвращает `uploadUrl` (presigned MinIO URL). Мета-данные в plugin SQLite (data.db). Проверить что uploadUrl валидный URL. Проверить что тест проходит.

- [x] 18.4 Тест: GET /plugins/photo-gallery/photos?page=1&limit=10 -> список с пагинацией (items, total, page, pages). Каждый item содержит `downloadUrl` (presigned MinIO URL). Проверить что тест проходит.

- [x] 18.5 Тест: GET /plugins/photo-gallery/photos?search=sunset -> фильтрация по description через SQLite LIKE. Проверить что тест проходит.

- [x] 18.6 Тест: PUT /plugins/photo-gallery/photos/:id {description: "new"} -> обновление описания в plugin SQLite. Проверить что тест проходит.

- [x] 18.7 Тест: DELETE /plugins/photo-gallery/photos/:id -> meta удалена из plugin SQLite, MinIO object удалён через `minio.deleteObject(key)`. Проверить что тест проходит.

- [x] 18.8 Тест: mobile UI — GET /plugins/photo-gallery/ возвращает HTML с viewport meta tag и responsive CSS. Проверить что тест проходит.

## 19. E2E тесты: Fallback

- [x] 19.1 Describe `Fallback`. Тест: без плагинов в SQLite — `GET /plugins/api/list` возвращает пустой массив, `generateCatalogPrompt()` не содержит секцию плагинов. Проверить что тест проходит.

## 20. Package.json и финальная проверка

- [ ] 20.1 Добавить скрипт `"test:e2e": "jest --testPathPattern=tests/e2e --forceExit"` в package.json. Проверить что `npm run test:e2e` запускает только e2e тесты.

- [ ] 20.2 Запустить `npm run test:e2e` — все тесты проходят (или скипаются если Docker/qodercli недоступны). Проверить что `npx tsc --noEmit` чист.

- [ ] 20.3 Запустить `npm test` — существующие тесты не сломаны. Проверить что общее количество passing тестов >= предыдущего.
