## Context

qoder-proxy спавнит qodercli с MCP серверами per-request. Нужно добавить систему плагинов: AI-сгенерированные приложения (JS) с UI и API, хранящиеся в SQLite с версионированием. Плагины создаются через промпты к LLM, валидируются, загружаются как Express sub-routes.

Существующие компоненты для интеграции:
- `src/project-config/` — YAML конфиги проектов, алиасы, каталог
- `src/mcp-gen/` — генерация MCP JSON (pg_*, redis_*, git_*, playwright)
- `src/dashboard-apps/` — динамическая загрузка controller.js (прототип плагин-лоадера)
- `src/chat.controller.ts` — `prepareProjectContext()`, `--mcp-config`, `--append-system-prompt`
- `src/qoder-cli/qoder-cli.service.ts` — spawn qodercli, stream-json парсинг

## Goals / Non-Goals

**Goals:**
- SQLite хранение плагинов + версий + промптов (монтируемый том)
- Версионирование (semver), откат на предыдущую версию
- Валидация HTML/JS/controller.js с циклом автоисправления (3+3 попытки)
- Загрузка плагинов как Express sub-routes с init({pg, redis})
- Plugin API для LLM и UI (список, детали, rollback)
- Системный промпт с каталогом плагинов
- Дополнительные MCP серверы (filesystem, fetch, sqlite)
- E2E тесты с testcontainers (PG + Redis)

**Non-Goals:**
- Не заменяем dashboard-apps (плагины — параллельная система)
- Не тестируем GitHub clone в e2e
- Не тестируем Playwright в e2e
- Не делаем CRUD UI для плагинов (только API)

## Decisions

### 1. SQLite для хранения плагинов

**Решение:** `better-sqlite3` — синхронный, быстрый, без отдельного сервиса.

**Схема:**
```sql
plugins (id, slug, name, description, icon, created_at, updated_at)
plugin_versions (id, plugin_id, version, prompt, files_json, openapi_spec, created_at)
  -- files_json хранит содержимое ВСЕХ файлов как JSON
  -- {"meta.json": "...", "index.html": "...", "controller.js": "..."}
  -- openapi_spec: OpenAPI YAML (предоставленная пользователем или автогенерированная)
plugin_active (plugin_id, version_id)
plugin_data (id, plugin_id, key, value_json, created_at, updated_at, UNIQUE(plugin_id, key))
  -- универсальное хранилище произвольных данных для плагинов
```

**Файлы на диске (кэш для require()):**
```
/data/plugins.db                          # SQLite БД (источник правды)
/data/plugins/:slug/:version/             # кэш файлов для require()
  meta.json, index.html, controller.js
```

При загрузке плагина: если файлов нет на диске, но есть в БД -> восстановить из `files_json`.

**Альтернативы:** PostgreSQL — оверкилл для метаданных, JSON файлы — нет атомарности.

### 2. Контракт плагина

```js
// controller.js
module.exports = {
  meta: { name: 'SQL Manager', description: '...', icon: 'database' },
  init({ pg, redis, minio, storage, db }) {
    // storage — универсальное хранилище данных плагина (key-value JSON)
    // storage.get('settings') -> JSON или null
    // storage.set('settings', {theme: 'dark'})
    // storage.delete('settings')
    // storage.list() -> [{key, value}]
    //
    // db — отдельная SQLite БД для данных плагина (/data/plugins/:slug/data.db)
    // Плагин создаёт свои таблицы и делает SQL запросы:
    // db.exec('CREATE TABLE IF NOT EXISTS photos (...)')
    // db.prepare('SELECT * FROM photos LIMIT ?').all(10)
  },
  routes: [
    { method: 'post', path: '/query', handler: async (req, res) => {} },
    { method: 'get', path: '/history', handler: async (req, res) => {} },
  ],
  setupStream: (req, res) => {} // опционально SSE
};
```

**init()** вызывается один раз при загрузке с реальными подключениями из ConnectionRegistry.

### 3. Валидация и цикл автоисправления

```
Создание плагина:
  1. qodercli создаёт файлы в /data/plugins/:slug/:version/
  2. Валидация:
     a. HTML: парсинг (есть <html>, <body>, нет критических ошибок)
     b. JS: `node --check controller.js` (синтаксис)
     c. Контракт: require() -> routes массив, meta объект
     d. OpenAPI: если предоставлена спека — проверка что все
        paths из спеки реализованы в routes (method + path)
  3. Если ошибки:
     - Попытки 1-3: spawn qodercli с промптом "ошибки: [stderr], исправь"
     - Попытки 4-6: перегенерация с нуля (новый spawn, чистый контекст)
     - После 6 неудач: ответ пользователю "перепишите запрос"
```

**OpenAPI как контракт генерации:**

Пользователь может приложить OpenAPI спеку (YAML) к текстовому описанию.
Спека включается в системный промпт для qodercli:

```
## Plugin Contract (OpenAPI)
The plugin MUST implement exactly these endpoints:
[OpenAPI YAML content]
```

Это делает генерацию детерминированной:
- AI создаёт routes точно по спеке
- Тесты проверяют что все endpoints из спеки существуют
- Response schema проверяется через Ajv или аналог

**Если OpenAPI не указана:**

AI всё равно создаёт плагин с каким-то API. После создания:
1. Из controller.js извлекаются routes: `[{method, path}]`
2. Генерируется OpenAPI спека из фактических routes (auto-spec)
3. Спека сохраняется как контракт этой версии (колонка `openapi_spec` в `plugin_versions`)
4. Тесты проверяют что API плагина соответствует его auto-spec

**Результат:** каждая версия плагина всегда имеет контракт — либо предоставленный пользователем, либо автогенерированный. При модификации плагина можно сравнить старый и новый контракт.

**Валидация на стороне прокси**, не в qodercli. Прокси парсит stdout qodercli для извлечения созданных файлов.

### 4. Plugin Loader

По аналогии с `DashboardAppsService`:
- Сканирует `/data/plugins/` при старте
- Для каждого плагина: загружает активную версию из SQLite
- Если файлов нет на диске — восстанавливает из `files_json` в БД
- Открывает отдельную SQLite БД для плагина: `/data/plugins/:slug/data.db`
- `require(controller.js)` -> `init({pg, redis, minio, storage, db})` — storage привязан к plugin_id, db — отдельная SQLite для данных плагина
- **MinIO presigned URLs**: `minio.getPresignedUploadUrl(key, contentType)` и `minio.getPresignedDownloadUrl(key)` — файлы загружаются/скачиваются напрямую через MinIO, бэкенд не перегоняет файлы через себя
- Express sub-router на `/plugins/:slug/`
- Статика (index.html) через `express.static`

### 5. Plugin API endpoints

```
GET  /plugins/api/list           -> [{slug, name, description, version, url}]
GET  /plugins/api/:slug          -> {plugin, versions: [{version, prompt, created_at}]}
GET  /plugins/api/:slug/:version -> {version, prompt, files}
POST /plugins/api/:slug/rollback -> {version: "1.0.0"} (откат)
```

LLM использует `GET /plugins/api/list` через системный промпт для ответа "какие есть приложения".

### 6. System Prompt расширение

```
## Available Plugins

### sql-manager (v1.2.0)
- Description: SQL query manager with Redis caching
- URL: /plugins/sql-manager/
- API: POST /plugins/sql-manager/query, GET /plugins/sql-manager/history

### joke-fetcher (v1.0.0)
- Description: Random jokes from bash.org
- URL: /plugins/joke-fetcher/
- API: GET /plugins/joke-fetcher/joke
```

### 7. Дополнительные MCP серверы

Добавляются в McpGenService для всех проектов:
- `filesystem` — `@modelcontextprotocol/server-filesystem` с cwd проекта
- `fetch` — `@modelcontextprotocol/server-fetch` (HTTP запросы, парсинг)
- `sqlite` — `@modelcontextprotocol/server-sqlite` с путём к plugins.db

### 8. Plugin Creation Flow (в контроллере)

```
POST /v1/chat/completions
  "создай SQL менеджер"
  |
  v
ChatController.prepareProjectContext()
  -> MCP конфиг включает filesystem + fetch + sqlite
  -> Системный промпт включает контракт плагина
  |
  v
qodercli создаёт файлы
  |
  v
PluginCreationService.interceptAndSave()
  -> Парсит stdout для извлечения файлов
  -> Сохраняет в SQLite (новая версия)
  -> Копирует файлы в /data/plugins/:slug/:version/
  -> Запускает валидацию
  -> Если валидно: загружает плагин
  -> Если нет: цикл автоисправления
```

### 9. E2E тесты с testcontainers

**Контейнеры:** PostgreSQL, Redis
**Фикстуры:** YAML конфиги с портами контейнеров
**Тесты:** создание плагина (мок qodercli для детерминированности), валидация, загрузка, API, кэш, версии, откат, LLM список

## Risks / Trade-offs

### better-sqlite3 — native module
**Риск:** требует компиляцию при `npm install`
**Митигация:** `node-gyp` зависимости в Dockerfile, или prebuild binaries

### Валидация HTML/JS — не идеальна
**Риск:** AI может создать код который проходит валидацию но не работает
**Митигация:** валидация проверяет синтаксис и контракт, реальная работа проверяется в e2e

### Цикл 3+3 — может быть медленным
**Риск:** 6 spawn qodercli = 3-10 минут
**Митигация:** таймаут на весь цикл, параллельные попытки не нужны (последовательные)

### Плагин может сломать прокси
**Риск:** controller.js с бесконечным циклом или утечкой памяти
**Митигация:** timeout на handler, изоляция в будущем (worker threads)

## Migration Plan

1. Установить зависимости (better-sqlite3, testcontainers, MCP пакеты)
2. Создать `src/plugin-storage/` — SQLite схема, CRUD
3. Создать `src/plugin-manager/` — loader, validator, creation flow
4. Создать `src/plugin-controller.ts` — API + routes
5. Обновить `src/mcp-gen/` — добавить filesystem, fetch, sqlite MCP
6. Обновить `src/project-config/` — plugin catalog в системном промпте
7. Обновить `Dockerfile` — `/data` директория
8. Создать `docker-compose.yml` — volume `./data:/data`
9. Создать `tests/e2e/` — setup + тесты
10. Обновить `package.json` — `test:e2e` скрипт
