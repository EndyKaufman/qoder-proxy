## Почему

Проект планируется переписать с JavaScript на TypeScript/NestJS. Чтобы гарантировать, что после переписывания все API-эндпоинты продолжают работать идентично, необходим полный набор интеграционных и юнит-тестов, покрывающих каждый маршрут, middleware и вспомогательную функцию. Без тестов невозможно обнаружить регрессии после миграции.

## Что меняется

- Добавляется тестовый фреймворк (Jest + supertest) и конфигурация для запуска тестов.
- Создаются **интеграционные тесты** для всех HTTP-эндпоинтов:
  - `GET /` — корневая информация о сервере
  - `GET /health` — проверка доступности qodercli
  - `POST /v1/chat/completions` — chat completions (streaming и non-streaming)
  - `GET /v1/chat/completions` — возврат ошибки 400
  - `POST /v1/completions` — legacy completions (streaming и non-streaming)
  - `GET /v1/models` — список моделей (нативные + алиасы)
  - `POST /v1/embeddings` — возврат 501 Not Implemented
  - `* /v1/*` — catch-all 404 для неизвестных маршрутов
  - Dashboard API: `GET/POST /dashboard/login`, `GET /dashboard/logout`, `GET /dashboard/api/config`, `GET /dashboard/api/status`, `GET /dashboard/api/models`, `POST /dashboard/api/chat`, `GET/DELETE /dashboard/api/logs`, `GET/DELETE /dashboard/api/logs/system`
- Создаются **юнит-тесты** для middleware:
  - `auth.js` — Bearer-токен аутентификация (с ключом и без)
  - `dashboardAuth.js` — создание/проверка токенов, cookie, middleware
  - `logger.js` — логирование запросов и SSE-потоков
- Создаются **юнит-тесты** для хелперов:
  - `format.js` — `getModelMapping`, `messagesToPrompt`, `extractTextContent`, `extractToolCalls`, `newId`, все `build*` функции
  - `toolPrompt.js` — `buildToolSystemPrompt`, `buildPromptWithTools`, `parseToolCallFromText`, `toOpenAIToolCalls`
  - `spawn.js` — `parseStreamJsonLine`, `extractEventText`, `hasVisibleAssistantText`, `deepFindText`
  - `logStore.js` — `addRequest`, `addSystem`, `getRequests`, `getSystem`, `clearRequests`, `clearSystem`, truncation
- Добавляется npm-скрипт `npm test` для запуска тестов.
- Все вызовы `runQoderRequest` и `checkQoderCli` мокаются в интеграционных тестах, чтобы тесты не зависели от реального бинарника qodercli.

## Возможности

### Новые возможности
- `api-integration-tests`: Интеграционные тесты всех HTTP-эндпоинтов прокси (v1 routes, health, root, dashboard API) с проверкой кодов ответов, форматов тел и поведения при ошибках.
- `unit-tests-helpers`: Юнит-тесты всех вспомогательных функций (format, toolPrompt, spawn helpers) — маппинг моделей, парсинг сообщений, построение ответов.
- `unit-tests-middleware`: Юнит-тесты middleware (auth, dashboardAuth, logger) — аутентификация, токены, логирование.
- `unit-tests-store`: Юнит-тесты logStore — добавление, получение, очистка и обрезка записей.

### Изменённые возможности
— (нет существующих спецификаций)

## Влияние

- **Зависимости**: добавляются `jest`, `supertest`, `@types/jest` (devDependencies).
- **package.json**: добавляется скрипт `test`, секция `jest` конфигурация.
- **Структура**: создаётся директория `tests/` с поддиректориями `integration/` и `unit/`.
- **CI**: тесты должны запускаться без внешних сервисов (qodercli мокается).
- **API**: не меняется — тесты только проверяют существующее поведение.
