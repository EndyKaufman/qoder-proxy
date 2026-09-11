## Purpose

Отправка результата обработки запроса на указанный webhook URL после завершения работы. Позволяет асинхронное взаимодействие: клиент отправляет запрос с webhook URL и получает результат позже, не удерживая HTTP-соединение.

## ADDED Requirements

### Requirement: Поле webhook_url в API-запросе
API-эндпоинты `/v1/chat/completions` и `/v1/completions` SHALL поддерживать опциональное поле `webhook_url` (строка, валидный HTTP/HTTPS URL). При наличии этого поля система после завершения обработки отправляет POST-запрос с результатом на указанный URL.

#### Scenario: Запрос с webhook_url
- **WHEN** клиент отправляет `POST /v1/chat/completions` с `{"messages": [...], "webhook_url": "https://example.com/callback"}`
- **THEN** система обрабатывает запрос как обычно, а после завершения отправляет `POST https://example.com/callback` с JSON-телом результата

#### Scenario: Запрос без webhook_url
- **WHEN** клиент отправляет запрос без поля `webhook_url`
- **THEN** система работает как обычно, webhook не вызывается (полная обратная совместимость)

### Requirement: Формат webhook-запроса
Webhook-запрос SHALL быть HTTP POST с `Content-Type: application/json`. Тело запроса SHALL содержать: `status` ("success" или "error"), `result` (полный ответ API -- объект chat completion), `request_id` (идентификатор запроса для корреляции), `timestamp` (ISO 8601).

#### Scenario: Успешный результат
- **WHEN** обработка завершена успешно
- **THEN** webhook POST содержит `{"status": "success", "result": {...полный ответ...}, "request_id": "req-123", "timestamp": "2026-09-11T..."}`

#### Scenario: Ошибка обработки
- **WHEN** обработка завершилась с ошибкой (таймаут, ошибка демона)
- **THEN** webhook POST содержит `{"status": "error", "error": "описание ошибки", "request_id": "req-123", "timestamp": "2026-09-11T..."}`

### Requirement: Повторные попытки при ошибке webhook
Если webhook-запрос завершился с ошибкой (сеть, 5xx ответ), система SHALL повторить запрос с экспоненциальной задержкой (3 попытки: 1с, 5с, 25с). После исчерпания попыток -- залогировать ошибку.

#### Scenario: Webhook недоступен с первого раза
- **WHEN** первый POST на webhook возвращает 500
- **THEN** система повторяет через 1 секунду, затем через 5 секунд, затем через 25 секунд

#### Scenario: Все попытки исчерпаны
- **WHEN** все 3 попытки webhook завершились ошибкой
- **THEN** система логирует ошибку `webhook delivery failed after 3 retries for request_id=req-123`

### Requirement: Поддержка streaming + webhook
При `stream: true` и наличии `webhook_url` система SHALL отправить webhook после завершения всего streaming-ответа, с полным собранным ответом.

#### Scenario: Streaming с webhook
- **WHEN** клиент отправляет `{"stream": true, "webhook_url": "https://..."}`
- **THEN** система стримит SSE-чанки клиенту, а после завершения стрима отправляет webhook с полным ответом

### Requirement: Таймаут webhook-запроса
Webhook-запрос SHALL иметь таймаут 30 секунд. При превышении -- считать попытку неудачной и повторить.

#### Scenario: Таймаут webhook
- **WHEN** webhook URL не отвечает в течение 30 секунд
- **THEN** попытка считается неудачной, система переходит к следующей попытке повтора
