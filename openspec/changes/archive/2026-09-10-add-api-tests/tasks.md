## 1. Инфраструктура тестов

- [x] 1.1 Установить devDependencies: `npm install --save-dev jest supertest`. Проверить: `npm ls jest supertest` показывает установленные пакеты.
- [x] 1.2 Добавить в `package.json` скрипт `"test": "jest"` и конфигурацию Jest (`testMatch`, `testEnvironment: "node"`). Проверить: `npm test` запускается без ошибок (0 тестов — OK).
- [x] 1.3 Создать структуру директорий: `tests/unit/helpers/`, `tests/unit/middleware/`, `tests/unit/store/`, `tests/integration/`. Проверить: директории существуют.
- [x] 1.4 Модифицировать `src/server.js` — экспортировать `app` (`module.exports = { app, start }`) без изменения текущей логики запуска. Проверить: `npm start` по-прежнему запускает сервер, `require('./src/server').app` возвращает Express-объект.

## 2. Юнит-тесты хелперов — format.js

- [x] 2.1 Создать `tests/unit/helpers/format.test.js`. Написать тесты для `getModelMapping`: прямые ID (auto, ultimate), OpenAI-алиасы (gpt-4 → auto, claude-3-opus → ultimate), неизвестные модели → auto, undefined → auto, эвристики по семействам. Проверить: все тесты проходят (`npx jest tests/unit/helpers/format.test.js`).
- [x] 2.2 Добавить тесты для `messagesToPrompt`: одно сообщение, системное сообщение, пустой массив → "Hello", ограничение 10 сообщений, multipart content. Проверить: все тесты проходят.
- [x] 2.3 Добавить тесты для `extractTextContent`: строковый content, массив content, null/undefined, части с value/text. Проверить: все тесты проходят.
- [x] 2.4 Добавить тесты для `extractToolCalls`: content с function-элементами, без function, не-массив. Проверить: все тесты проходят.
- [x] 2.5 Добавить тесты для `newId`: префикс, уникальность. Проверить: все тесты проходят.
- [x] 2.6 Добавить тесты для всех `build*` функций: `buildStreamChunk`, `buildDoneChunk`, `buildFullChatResponse`, `buildFullChatResponseWithTools`, `buildCompletionStreamChunk`, `buildFullCompletionResponse`. Проверить: все тесты проходят, структура ответов соответствует OpenAI-формату.

## 3. Юнит-тесты хелперов — toolPrompt.js

- [x] 3.1 Создать `tests/unit/helpers/toolPrompt.test.js`. Написать тесты для `buildToolSystemPrompt`: генерация инструкций с именами функций и JSON-схемами, пустой массив → пустая строка. Проверить: все тесты проходят.
- [x] 3.2 Добавить тесты для `buildPromptWithTools`: промпт с tools начинается с системного блока, без tools — делегирует messagesToPrompt. Проверить: все тесты проходят.
- [x] 3.3 Добавить тесты для `parseToolCallFromText`: извлечение JSON tool call, markdown-обёртка, обычный текст → null, невалидный JSON → null. Проверить: все тесты проходят.
- [x] 3.4 Добавить тесты для `toOpenAIToolCalls`: формирование OpenAI-формата с id, type, function.name, function.arguments (строка/объект). Проверить: все тесты проходят.

## 4. Юнит-тесты хелперов — spawn.js

- [x] 4.1 Создать `tests/unit/helpers/spawn.test.js`. Написать тесты для `extractEventText`: строковый content, массив content, data.result, вложенные объекты через deepFindText. Проверить: все тесты проходят.
- [x] 4.2 Добавить тесты для `hasVisibleAssistantText`: непустой текст → true, пустой/пробелы → false, массив content. Проверить: все тесты проходят.
- [x] 4.3 Добавить тесты для `deepFindText`: поиск текста в вложенных объектах по приоритетным ключам, максимальная глубина. Проверить: все тесты проходят.

## 5. Юнит-тесты store — logStore.js

- [x] 5.1 Создать `tests/unit/store/logStore.test.js`. Написать тесты для `addRequest`/`getRequests`: добавление записи, порядок (обратный), наличие id/timestamp. Проверить: все тесты проходят.
- [x] 5.2 Добавить тесты для `addSystem`/`getSystem`: добавление с level/source, порядок. Проверить: все тесты проходят.
- [x] 5.3 Добавить тесты для `clearRequests`/`clearSystem`: очистка возвращает пустой массив. Проверить: все тесты проходят.
- [x] 5.4 Добавить тесты для truncation: длинная строка обрезается с маркером, короткая — без изменений, null остаётся null. Проверить: все тесты проходят.
- [x] 5.5 Добавить тест для ограничения LOG_MAX_ENTRIES: при превышении старейшие записи удаляются. Проверить: все тесты проходят.

## 6. Юнит-тесты middleware — auth.js

- [x] 6.1 Создать `tests/unit/middleware/auth.test.js`. Использовать `jest.isolateModules()` для пересоздания модулей с разными env. Написать тесты: без API_KEY → next(), без Authorization header → 401, без Bearer prefix → 401, неверный токен → 401, верный токен → next(). Проверить: все тесты проходят.

## 7. Юнит-тесты middleware — dashboardAuth.js

- [x] 7.1 Создать `tests/unit/middleware/dashboardAuth.test.js`. Написать тесты для `createToken`/`verifyToken`: валидный токен → true, поддельный → false. Проверить: все тесты проходят.
- [x] 7.2 Добавить тесты для `setCookie`/`clearCookie`: Set-Cookie содержит qoder_dash, HttpOnly, SameSite, Max-Age=0 для clear. Проверить: все тесты проходят.
- [x] 7.3 Добавить тесты для middleware `dashboardAuth`: валидный cookie → next(), без cookie + не /api/ → редирект, без cookie + /api/ → 401. Проверить: все тесты проходят.

## 8. Юнит-тесты middleware — logger.js

- [x] 8.1 Создать `tests/unit/middleware/logger.test.js`. Замокать `logStore.addRequest`. Написать тесты: JSON-ответ → addRequest с requestPayload/responsePayload, SSE-поток → isStream: true, нерелевантные пути → addRequest не вызван, статус >= 400 → error не null. Проверить: все тесты проходят.

## 9. Интеграционные тесты — публичные эндпоинты

- [x] 9.1 Создать `tests/integration/setup.js` — тестовый helper, собирающий Express-приложение с моками spawn (`jest.mock('../../src/helpers/spawn')`). Экспортировать функцию `createApp()` и supertest-обёртку. Проверить: helper загружается без ошибок.
- [x] 9.2 Создать `tests/integration/public-routes.test.js`. Тесты для `GET /`: статус 200, тело содержит name, version, endpoints. Тест для `GET /health` с моком checkQoderCli (доступен → 200, недоступен → 503). Проверить: все тесты проходят.

## 10. Интеграционные тесты — аутентификация /v1

- [x] 10.1 Создать `tests/integration/auth.test.js`. С пересозданием app через `jest.isolateModules()`. Тесты: без API_KEY → запросы проходят, с API_KEY без токена → 401, с неверным токеном → 401, с верным токеном → не 401. Проверить: все тесты проходят.

## 11. Интеграционные тесты — chat completions

- [x] 11.1 Создать `tests/integration/chat-completions.test.js`. Замокать `runQoderRequest`. Тесты non-streaming: без messages → 400, пустой массив → 400, успешный запрос → 200 + chat.completion, модель по умолчанию → auto. Проверить: все тесты проходят.
- [x] 11.2 Добавить тесты streaming: SSE-заголовки, начальный чанк с role: assistant, завершение на `data: [DONE]`. Проверить: все тесты проходят.

## 12. Интеграционные тесты — completions, models, embeddings, catch-all

- [x] 12.1 Создать `tests/integration/completions.test.js`. Тесты: без prompt → 400, успешный non-streaming → text_completion, streaming → SSE с начальным чанком. Проверить: все тесты проходят.
- [x] 12.2 Создать `tests/integration/models.test.js`. Тесты: GET /v1/models → object: list, data содержит нативные модели и алиасы с is_alias: true. Проверить: все тесты проходят.
- [x] 12.3 Создать `tests/integration/misc.test.js`. Тесты: POST /v1/embeddings → 501 + endpoint_not_supported, неизвестный /v1/* → 404 + endpoint_not_found. Проверить: все тесты проходят.

## 13. Интеграционные тесты — Dashboard API

- [x] 13.1 Создать `tests/integration/dashboard.test.js`. Настроить DASHBOARD_PASSWORD и DASHBOARD_ENABLED. Тесты: POST /dashboard/login с верным паролем → 302 + cookie, с неверным → 302 + error, GET /dashboard/logout → 302 + очистка cookie. Проверить: все тесты проходят.
- [x] 13.2 Добавить тесты для защищённых API: без cookie → 401, с валидным cookie → GET /dashboard/api/config (200, version, authEnabled), GET /dashboard/api/status (status, uptime, version), GET /dashboard/api/models (models), GET/DELETE /dashboard/api/logs, GET/DELETE /dashboard/api/logs/system. Проверить: все тесты проходят.

## 14. Финальная проверка

- [x] 14.1 Запустить `npm test` и убедиться, что все тесты проходят (0 failures). Проверить: вывод jest показывает итог "Tests: X passed, X total".
- [x] 14.2 Убедиться, что `npm start` по-прежнему запускает сервер корректно (production-код не сломан). Проверить: `node src/server.js` стартует без ошибок.
