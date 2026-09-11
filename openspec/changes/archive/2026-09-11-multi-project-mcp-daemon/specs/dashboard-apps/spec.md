## Purpose

Создание, регистрация и управление мини-приложениями (дашбордами), которые агрегируют данные из различных источников (PostgreSQL, Redis, MinIO, NATS, Docker, файлов) и отображают их в браузере. AI-агент генерирует код дашборда (controller.js + HTML/JS), прокси динамически регистрирует его через Express router без перезапуска сервера.

## ADDED Requirements

### Requirement: Директория дашбордов
Система SHALL хранить дашборды в директории `DASHBOARD_APPS_DIR` (env-переменная, по умолчанию `/dashboard-apps`). Каждый дашборд -- поддиректория с именем приложения, содержащая минимум `index.html` и опционально `controller.js`.

#### Scenario: Структура дашборда
- **WHEN** создан дашборд `db-monitor`
- **THEN** существует директория `/dashboard-apps/db-monitor/` с файлами `index.html` (фронтенд) и опционально `controller.js` (API-логика)

#### Scenario: Пустая директория дашбордов
- **WHEN** `DASHBOARD_APPS_DIR` не существует или пуста
- **THEN** система запускается нормально, `/dashboard-apps/` возвращает пустой список

### Requirement: Динамическая регистрация через Express router
Система SHALL при старте и при изменении директории дашбордов сканировать поддиректории и регистрировать их в Express router на пути `/dashboard-apps/:appName/*`. Если дашборд содержит `controller.js`, его exports регистрируются как API-маршруты.

#### Scenario: Регистрация дашборда с controller.js
- **WHEN** дашборд `db-monitor` содержит `controller.js` экспортирующий `{ routes: [{ method: "get", path: "/queries", handler: fn }] }`
- **THEN** регистрируется маршрут `GET /dashboard-apps/db-monitor/queries`, вызывающий handler

#### Scenario: Регистрация дашборда без controller.js
- **WHEN** дашборд `simple-view` содержит только `index.html`
- **THEN** регистрируется `GET /dashboard-apps/simple-view` отдающий `index.html` как статический файл

#### Scenario: Динамическое добавление дашборда
- **WHEN** в `DASHBOARD_APPS_DIR` появляется новая поддиректория с дашбордом
- **THEN** система обнаруживает её (file watcher) и регистрирует маршруты без перезапуска сервера

#### Scenario: Динамическое удаление дашборда
- **WHEN** поддиректория дашборда удаляется из `DASHBOARD_APPS_DIR`
- **THEN** система убирает маршруты этого дашборда

### Requirement: Список дашбордов
Система SHALL предоставлять API-эндпоинт `GET /dashboard-apps/` возвращающий список зарегистрированных дашбордов с их именами, описаниями (из `meta.json` если есть) и статусами.

#### Scenario: Список с двумя дашбордами
- **WHEN** зарегистрированы дашборды `db-monitor` и `users-balance`
- **THEN** `GET /dashboard-apps/` возвращает `[{name: "db-monitor", description: "...", status: "active"}, {name: "users-balance", ...}]`

### Requirement: Метаданные дашборда
Каждый дашборд MAY содержать `meta.json` с полями: `name` (отображаемое имя), `description` (описание), `author` (автор/агент), `created` (дата создания), `sources` (массив источников данных, которые использует дашборд).

#### Scenario: Дашборд с meta.json
- **WHEN** дашборд содержит `meta.json` с `{name: "Монитор БД", description: "Real-time запросы к PostgreSQL", sources: ["pg_alpha"]}`
- **THEN** список дашбордов отображает эти метаданные

### Requirement: Статические файлы дашборда
Система SHALL отдавать статические файлы дашборда (HTML, CSS, JS, изображения) из его директории через `express.static`.

#### Scenario: Загрузка фронтенда
- **WHEN** пользователь открывает `/dashboard-apps/db-monitor/`
- **THEN** система отдаёт `index.html` из `/dashboard-apps/db-monitor/`, а также CSS/JS файлы из той же директории

### Requirement: Доступ к MCP-сервисам из controller.js
`controller.js` дашборда SHALL иметь доступ к подключениям MCP-сервисов через механизм, предоставляемый прокси (например, через глобальный реестр подключений или через инъекцию в require context). Это позволяет дашборду выполнять SQL-запросы, читать Redis, слушать NATS и т.д.

#### Scenario: SQL-запрос из дашборда
- **WHEN** controller.js дашборда вызывает `getPgConnection('alpha').query('SELECT * FROM users')`
- **THEN** выполняется запрос к PostgreSQL проекта alpha и результат возвращается в handler

#### Scenario: Данные из двух проектов
- **WHEN** controller.js дашборда запрашивает `getPgConnection('alpha')` и `getPgConnection('beta')`
- **THEN** дашборд получает данные из обеих баз и может их объединить/сравнить

### Requirement: Real-time обновления (SSE/WebSocket)
Дашборд MAY поддерживать real-time обновления данных через Server-Sent Events (SSE) или WebSocket. Controller.js может экспортировать `setupStream(req, res)` для SSE-подключения.

#### Scenario: SSE для real-time мониторинга БД
- **WHEN** дашборд `db-monitor` экспортирует `setupStream`
- **THEN** клиент подключается к `GET /dashboard-apps/db-monitor/stream` и получает SSE-события с новыми данными

### Requirement: AI-генерация дашбордов
AI-агент (через qodercli) SHALL иметь возможность создавать дашборды: генерировать `controller.js`, `index.html`, `meta.json` и записывать их в `DASHBOARD_APPS_DIR`. После записи система автоматически регистрирует новый дашборд.

#### Scenario: Создание дашборда по запросу
- **WHEN** пользователь просит "создай дашборд с реальными запросами к базе alpha"
- **THEN** AI генерирует controller.js (с SQL-запросами через MCP pg_alpha), index.html (с таблицей/графиком), meta.json -- и записывает в `/dashboard-apps/db-monitor/`
- **THEN** система обнаруживает новый дашборд и регистрирует его

#### Scenario: Обновление дашборда
- **WHEN** пользователь просит "добавь график нагрузки в db-monitor"
- **THEN** AI обновляет файлы дашборда, система перечитывает и перерегистрирует маршруты
