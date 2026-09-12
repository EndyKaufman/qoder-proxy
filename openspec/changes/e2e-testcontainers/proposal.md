## Why

qoder-proxy уже умеет спавнить qodercli с MCP серверами и системным промптом. Но нет системы для создания, хранения, версионирования и загрузки AI-сгенерированных приложений (плагинов). Пользователь должен иметь возможность попросить LLM создать приложение (например, "SQL менеджер с кэшированием" или "анекдоты с bash.org"), а прокси — сохранить его, загрузить, предоставить UI и API. Приложения должны версионироваться (каждая модификация = новая версия), хранить промпт создания, и проходить валидацию с циклом автоисправления (3 попытки починить -> 3 перегенерации -> отказ).

## What Changes

### Новая функциональность (прокси):

- **Plugin Storage** — SQLite (`better-sqlite3`) для хранения плагинов, версий и данных. Файл БД в монтируемой директории (`/data/plugins.db`). Файлы плагинов (meta.json, index.html, controller.js) хранятся **в БД** (колонка `files_json`) и дублируются на диск в `/data/plugins/:slug/:version/` для require(). Универсальное хранилище `plugin_data` (key + JSON value) для произвольных данных плагинов.
- **PluginManagerService** — CRUD плагинов, версионирование (semver), активная версия, откат, сохранение промпта каждой версии
- **Plugin Loader** — загрузка controller.js, вызов `init({pg, redis, minio})`, регистрация Express маршрутов, раздача статики (index.html)
- **Plugin Validation** — валидация HTML (структура), JS (`node --check`), controller.js контракта (routes массив). Цикл: 3 попытки починить (AI получает stderr) -> 3 перегенерации с нуля -> отказ с просьбой переписать запрос. Поддержка OpenAPI спеки (YAML) как контракта для генерации — AI создаёт плагин точно по спеке, тесты проверяют соответствие.
- **Plugin API** — `GET /plugins/api/list` (список для LLM и UI), `GET /plugins/api/:name` (версии), `GET /plugins/api/:name/:ver` (детали версии + промпт), `POST /plugins/api/:name/rollback`
- **Plugin Routes** — `GET /plugins/:slug/` (UI), `*/plugins/:slug/*` (API маршруты из controller.js)
- **System Prompt** — каталог плагинов в `--append-system-prompt` чтобы LLM знал какие приложения есть и мог их перечислить
- **Дополнительные MCP** — `@modelcontextprotocol/server-filesystem` (файлы), `@modelcontextprotocol/server-fetch` (HTTP/парсинг), `@modelcontextprotocol/server-sqlite` (SQLite)

### E2E тесты (testcontainers):

- **Testcontainers** — PostgreSQL, Redis для реальных подключений
- **E2E тесты** — создание плагина через qodercli, валидация, загрузка, API проверка, кэширование, версионирование, откат, LLM список приложений

## Capabilities

### New Capabilities

_Не вводятся новые capabilities в main specs — это тестовая + plugin инфраструктура._

### Modified Capabilities

_Не изменяются существующие capabilities._

`skip_specs: true` — изменение добавляет новую подсистему (плагины) и тесты, не меняя существующие capabilities.

## Impact

- **Зависимости**: `better-sqlite3`, `testcontainers`, `@testcontainers/postgresql`, `@testcontainers/redis`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-fetch`, `@modelcontextprotocol/server-sqlite`
- **Новые файлы**: `src/plugin-storage/` (SQLite + CRUD), `src/plugin-manager/` (загрузка, валидация, создание), `src/plugin-controller.ts` (API + routes)
- **Новые env vars**: `PLUGINS_DB_PATH`, `PLUGINS_FILES_DIR`
- **Dockerfile**: создание `/data` директории, volume для `/data`
- **Тесты**: `tests/e2e/` с testcontainers
- **Docker**: `docker-compose.yml` с volume `./data:/data`
