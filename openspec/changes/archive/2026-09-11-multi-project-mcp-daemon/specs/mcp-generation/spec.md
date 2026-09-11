## Purpose

Генерация объединённого MCP JSON-конфига для всех загруженных проектов, с префиксованными именами серверов, чтобы qodercli мог одновременно работать с сервисами разных проектов.

## ADDED Requirements

### Requirement: Генерация MCP JSON при старте
Система SHALL после загрузки конфигов проектов сгенерировать единый MCP JSON-объект, содержащий серверы для всех проектов. Имена серверов формируются с префиксом имени проекта: `{service}_{project_name}` (например, `pg_alpha`, `redis_beta`).

#### Scenario: Два проекта с PostgreSQL
- **WHEN** загружены проекты `alpha` (postgres: alpha_db) и `beta` (postgres: beta_db)
- **THEN** сгенерированный MCP JSON содержит серверы `pg_alpha` и `pg_beta` с соответствующими connection strings

#### Scenario: Проект без сервисов
- **WHEN** проект `gamma` имеет только `path` без подключений к сервисам
- **THEN** для проекта `gamma` не генерируется ни одного MCP-сервера (только filesystem доступ через cwd)

#### Scenario: Docker -- общий сервер
- **WHEN** несколько проектов указывают `docker` с одинаковым хостом
- **THEN** генерируется один сервер `docker` (без префикса проекта)

### Requirement: Соответствие типов сервисов MCP-пакетам
Каждый тип сервиса SHALL маппиться на конкретный MCP npm-пакет:
- postgres → `@modelcontextprotocol/server-postgres` (connection string в args)
- redis → `@modelcontextprotocol/server-redis` (REDIS_URL в env)
- minio → `@pickstar-2002/minio-storage-mcp` (MINIO_* в env)
- nats → `@daanrongen/nats-mcp` (NATS_URL в env)
- docker → `@0xshariq/docker-mcp-server` (DOCKER_HOST в env)
- git → `git-summary-mcp` (GIT_REPO_PATH в env, на каждый проект)

#### Scenario: PostgreSQL MCP сервер
- **WHEN** проект имеет postgres конфиг
- **THEN** генерируется сервер с `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-postgres", "<connection_string>"]`

#### Scenario: Redis MCP сервер
- **WHEN** проект имеет redis конфиг `{host: h, port: p, db: 0}`
- **THEN** генерируется сервер с env `REDIS_URL: "redis://h:p/0"`

#### Scenario: NATS MCP сервер
- **WHEN** проект имеет nats конфиг `{url: "nats://host:4222"}`
- **THEN** генерируется сервер с env `NATS_URL: "nats://host:4222"`

### Requirement: Запись MCP JSON во временный файл
Сгенерированный MCP JSON SHALL записываться во временный файл, путь к которому передаётся демону через флаг `--mcp-config`. Файл перезаписывается при изменении списка проектов.

#### Scenario: Запись и передача пути
- **WHEN** сгенерирован MCP JSON для 3 проектов
- **THEN** файл записан (например, `/tmp/mcp-config.json`), путь передётся демону при запуске

#### Scenario: Обновление MCP JSON
- **WHEN** добавлен новый проект после старта
- **THEN** MCP JSON перезаписывается с учётом нового проекта, демон перезапускается с обновлённым конфигом

### Requirement: Git MCP сервер для каждого проекта
Для каждого загруженного проекта система SHALL генерировать MCP-сервер `git_{project_name}` на базе `git-summary-mcp`, указывающий на путь к коду проекта.

#### Scenario: Git доступ к коду проекта
- **WHEN** загружен проект `alpha` с `path: /projects/alpha`
- **THEN** генерируется сервер `git_alpha` с env `GIT_REPO_PATH: "/projects/alpha"`
