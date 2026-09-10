## Purpose

Обеспечивает юнит-тесты для всех middleware приложения — аутентификация (auth), аутентификация дашборда (dashboardAuth) и логирование запросов (logger).

## Requirements

### Requirement: Тесты auth middleware
Система ДОЛЖНА предоставлять юнит-тесты для Bearer-токен аутентификации.

#### Scenario: Пропускает запрос без API_KEY
- **WHEN** `API_KEY` не установлен (null)
- **THEN** middleware ДОЛЖЕН вызвать `next()` для любого запроса

#### Scenario: Отклоняет запрос без Authorization header
- **WHEN** `API_KEY` установлен и запрос не содержит заголовка `Authorization`
- **THEN** статус-код ДОЛЖЕН быть 401, тело ДОЛЖНО содержать `error.code: "invalid_api_key"`

#### Scenario: Отклоняет запрос без Bearer prefix
- **WHEN** заголовок `Authorization` не начинается с `"Bearer "`
- **THEN** статус-код ДОЛЖЕН быть 401

#### Scenario: Отклоняет запрос с неверным токеном
- **WHEN** токен не совпадает с `API_KEY`
- **THEN** статус-код ДОЛЖЕН быть 401

#### Scenario: Пропускает запрос с верным токеном
- **WHEN** токен совпадает с `API_KEY`
- **THEN** middleware ДОЛЖЕН вызвать `next()`

### Requirement: Тесты dashboardAuth middleware
Система ДОЛЖНА предоставлять юнит-тесты для аутентификации панели управления.

#### Scenario: createToken генерирует валидный токен
- **WHEN** вызвана `createToken()`
- **THEN** `verifyToken()` ДОЛЖЕН вернуть true для сгенерированного токена

#### Scenario: verifyToken отклоняет поддельный токен
- **WHEN** передан произвольный base64url-токен
- **THEN** `verifyToken()` ДОЛЖЕН вернуть false

#### Scenario: setCookie устанавливает cookie qoder_dash
- **WHEN** вызвана `setCookie(res, token)`
- **THEN** заголовок `Set-Cookie` ДОЛЖЕН содержать `qoder_dash=<token>`, `HttpOnly`, `SameSite=Lax`

#### Scenario: clearCookie очищает cookie
- **WHEN** вызвана `clearCookie(res)`
- **THEN** `Set-Cookie` ДОЛЖЕН содержать `Max-Age=0`

#### Scenario: dashboardAuth пропускает авторизованный запрос
- **WHEN** cookie содержит валидный токен
- **THEN** middleware ДОЛЖЕН вызвать `next()`

#### Scenario: dashboardAuth редиректит на login для не-API путей
- **WHEN** cookie отсутствует и путь не начинается с `/api/`
- **THEN** ДОЛЖЕН быть редирект на `/dashboard/login`

#### Scenario: dashboardAuth возвращает 401 для API-путей
- **WHEN** cookie отсутствует и путь начинается с `/api/`
- **THEN** статус-код ДОЛЖЕН быть 401

### Requirement: Тесты logger middleware
Система ДОЛЖНА предоставлять юнит-тесты для middleware логирования.

#### Scenario: Логирует JSON-ответы
- **WHEN** обработан запрос с JSON-ответом
- **THEN** `addRequest` ДОЛЖЕН быть вызван с `requestPayload` и `responsePayload`

#### Scenario: Логирует SSE-потоки
- **WHEN** обработан streaming-запрос с SSE-чанками
- **THEN** `addRequest` ДОЛЖЕН быть вызван с `isStream: true` и `streamChunks`

#### Scenario: Не логирует нерелевантные пути
- **WHEN** обработан запрос на путь, не начинающийся с `/v1` или `/api/chat`
- **THEN** `addRequest` НЕ ДОЛЖЕН быть вызван

#### Scenario: Захватывает error при статусе >= 400
- **WHEN** ответ имеет статус-код >= 400
- **THEN** записанный `error` ДОЛЖЕН быть не null
