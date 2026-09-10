## Purpose

Обеспечивает полный набор интеграционных тестов для всех HTTP-эндпоинтов прокси, гарантируя, что каждый маршрут возвращает корректные коды ответов, форматы тел и поведение при ошибках — как с авторизацией, так и без неё.

## Requirements

### Requirement: Тесты корневых публичных эндпоинтов
Система ДОЛЖНА предоставлять интеграционные тесты для `GET /` и `GET /health`, проверяющие коды ответов и структуру тела.

#### Scenario: GET / возвращает информацию о сервере
- **WHEN** отправлен GET-запрос на `/`
- **THEN** статус-код ДОЛЖЕН быть 200, тело ДОЛЖНО содержать поля `name`, `version`, `endpoints`

#### Scenario: GET /health возвращает статус при отсутствии qodercli
- **WHEN** отправлен GET-запрос на `/health` и `checkQoderCli` замокан как недоступный
- **THEN** статус-код ДОЛЖЕН быть 503, тело ДОЛЖНО содержать `status: "degraded"`

#### Scenario: GET /health возвращает статус при доступном qodercli
- **WHEN** отправлен GET-запрос на `/health` и `checkQoderCli` замокан как доступный
- **THEN** статус-код ДОЛЖЕН быть 200, тело ДОЛЖНО содержать `status: "ok"`

### Requirement: Тесты аутентификации на /v1 маршрутах
Система ДОЛЖНА предоставлять тесты, проверяющие, что middleware auth корректно отклоняет запросы без токена и с неверным токеном, и пропускает с верным.

#### Scenario: Запрос без Bearer-токена отклоняется при включённой авторизации
- **WHEN** `PROXY_API_KEY` установлен и отправлен POST-запрос на `/v1/chat/completions` без заголовка `Authorization`
- **THEN** статус-код ДОЛЖЕН быть 401, тело ДОЛЖНО содержать `error.code: "invalid_api_key"`

#### Scenario: Запрос с неверным токеном отклоняется
- **WHEN** `PROXY_API_KEY` установлен и отправлен запрос с неверным Bearer-токеном
- **THEN** статус-код ДОЛЖЕН быть 401

#### Scenario: Запрос с верным токеном проходит
- **WHEN** `PROXY_API_KEY` установлен и отправлен запрос с корректным Bearer-токеном
- **THEN** запрос ДОЛЖЕН пройти через middleware (статус не 401)

#### Scenario: Запрос без токена проходит при отключённой авторизации
- **WHEN** `PROXY_API_KEY` не установлен
- **THEN** запросы на `/v1/*` ДОЛЖНЫ проходить без заголовка Authorization

### Requirement: Тесты POST /v1/chat/completions (non-streaming)
Система ДОЛЖНА предоставлять тесты для non-streaming chat completions с валидацией входных данных и корректным форматом ответа.

#### Scenario: Запрос без messages возвращает 400
- **WHEN** отправлен POST-запрос на `/v1/chat/completions` без поля `messages`
- **THEN** статус-код ДОЛЖЕН быть 400, тело ДОЛЖНО содержать ошибку `invalid_request_error`

#### Scenario: Запрос с пустым массивом messages возвращает 400
- **WHEN** отправлен POST-запрос с `messages: []`
- **THEN** статус-код ДОЛЖЕН быть 400

#### Scenario: Успешный non-streaming запрос
- **WHEN** отправлен POST-запрос с валидными `messages` и `stream: false`, а `runQoderRequest` замокан с ответом
- **THEN** статус-код ДОЛЖЕН быть 200, тело ДОЛЖНО содержать `object: "chat.completion"`, `choices[0].message.role: "assistant"`, `choices[0].message.content`

#### Scenario: Модель по умолчанию — auto
- **WHEN** отправлен запрос без поля `model`
- **THEN** замаканный `runQoderRequest` ДОЛЖЕН получить `model: "auto"`

### Requirement: Тесты POST /v1/chat/completions (streaming)
Система ДОЛЖНА предоставлять тесты для streaming chat completions, проверяющие SSE-формат и корректность чанков.

#### Scenario: Streaming запрос возвращает SSE-заголовки
- **WHEN** отправлен POST-запрос с `stream: true`
- **THEN** заголовки ответа ДОЛЖНЫ содержать `Content-Type: text/event-stream`, `Cache-Control: no-cache`

#### Scenario: Streaming отправляет начальный чанк с ролью
- **WHEN** streaming-запрос обработан
- **THEN** первый SSE-чанк ДОЛЖЕН содержать `delta.role: "assistant"`

#### Scenario: Streaming завершается чанком [DONE]
- **WHEN** qodercli завершает работу
- **THEN** поток ДОЛЖЕН завершиться чанком `data: [DONE]`

### Requirement: Тесты POST /v1/completions
Система ДОЛЖНА предоставлять тесты для legacy completions (streaming и non-streaming).

#### Scenario: Запрос без prompt возвращает 400
- **WHEN** отправлен POST-запрос на `/v1/completions` без `prompt`
- **THEN** статус-код ДОЛЖЕН быть 400

#### Scenario: Успешный non-streaming completions
- **WHEN** отправлен валидный POST-запрос с `prompt` и `stream: false`
- **THEN** статус-код ДОЛЖЕН быть 200, тело ДОЛЖНО содержать `object: "text_completion"`

#### Scenario: Streaming completions
- **WHEN** отправлен POST-запрос с `stream: true`
- **THEN** ответ ДОЛЖЕН быть в SSE-формате с начальным пустым чанком

### Requirement: Тесты GET /v1/models
Система ДОЛЖНА предоставлять тесты для эндпоинта моделей.

#### Scenario: Список моделей содержит нативные модели
- **WHEN** отправлен GET-запрос на `/v1/models`
- **THEN** тело ДОЛЖНО содержать `object: "list"` и массив `data` с моделями из `QODER_MODELS`

#### Scenario: Список моделей содержит OpenAI-алиасы
- **WHEN** отправлен GET-запрос на `/v1/models`
- **THEN** массив `data` ДОЛЖЕН содержать алиасы (gpt-4, claude-3.5-sonnet и т.д.) с `qoder.is_alias: true`

### Requirement: Тесты POST /v1/embeddings
Система ДОЛЖНА предоставлять тест, проверяющий, что эндпоинт embeddings возвращает 501.

#### Scenario: Embeddings не поддерживаются
- **WHEN** отправлен POST-запрос на `/v1/embeddings`
- **THEN** статус-код ДОЛЖЕН быть 501, тело ДОЛЖНО содержать `error.code: "endpoint_not_supported"`

### Requirement: Тесты catch-all для неизвестных /v1 маршрутов
Система ДОЛЖНА предоставлять тест для обработки неизвестных маршрутов.

#### Scenario: Неизвестный маршрут возвращает 404
- **WHEN** отправлен запрос на `/v1/unknown-endpoint`
- **THEN** статус-код ДОЛЖЕН быть 404, тело ДОЛЖНО содержать `error.code: "endpoint_not_found"`

### Requirement: Тесты Dashboard API
Система ДОЛЖНА предоставлять интеграционные тесты для всех Dashboard API-эндпоинтов, включая аутентификацию.

#### Scenario: Dashboard login с верным паролем
- **WHEN** отправлен POST-запрос на `/dashboard/login` с корректным паролем
- **THEN** ДОЛЖЕН быть редирект 302 на `/dashboard/` и установлен cookie `qoder_dash`

#### Scenario: Dashboard login с неверным паролем
- **WHEN** отправлен POST-запрос с неверным паролем
- **THEN** ДОЛЖЕН быть редирект 302 на `/dashboard/login?error=1`

#### Scenario: Dashboard API без авторизации возвращает 401
- **WHEN** отправлен GET-запрос на `/dashboard/api/config` без cookie
- **THEN** статус-код ДОЛЖЕН быть 401

#### Scenario: Dashboard API с авторизацией возвращает конфиг
- **WHEN** GET-запрос на `/dashboard/api/config` с валидным cookie
- **THEN** статус-код ДОЛЖЕН быть 200, тело ДОЛЖНО содержать `version`, `authEnabled`

#### Scenario: Dashboard GET /api/status
- **WHEN** авторизованный GET-запрос на `/dashboard/api/status`
- **THEN** тело ДОЛЖНО содержать `status`, `uptime`, `memoryMB`, `version`

#### Scenario: Dashboard GET /api/models
- **WHEN** авторизованный GET-запрос на `/dashboard/api/models`
- **THEN** тело ДОЛЖНО содержать `models` — массив моделей

#### Scenario: Dashboard GET /api/logs
- **WHEN** авторизованный GET-запрос на `/dashboard/api/logs`
- **THEN** тело ДОЛЖНО содержать `logs` — массив

#### Scenario: Dashboard DELETE /api/logs
- **WHEN** авторизованный DELETE-запрос на `/dashboard/api/logs`
- **THEN** тело ДОЛЖНО содержать `ok: true`

#### Scenario: Dashboard GET /api/logs/system
- **WHEN** авторизованный GET-запрос на `/dashboard/api/logs/system`
- **THEN** тело ДОЛЖНО содержать `logs` — массив системных записей

#### Scenario: Dashboard DELETE /api/logs/system
- **WHEN** авторизованный DELETE-запрос на `/dashboard/api/logs/system`
- **THEN** тело ДОЛЖНО содержать `ok: true`

#### Scenario: Dashboard logout
- **WHEN** GET-запрос на `/dashboard/logout`
- **THEN** ДОЛЖЕН быть редирект 302 на `/dashboard/login` и cookie ДОЛЖЕН быть очищен
