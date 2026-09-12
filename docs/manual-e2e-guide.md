# Руководство по ручной проверке E2E

Пошаговое руководство для ручной проверки того, что покрывают e2e тесты.

---

## 1. Подъём инфраструктуры

```bash
# Запустить все сервисы (PG, Redis, MinIO, NATS)
npm run test:e2e:setup

# Проверить что все контейнеры поднялись
docker compose -f examples/demo-project/docker-compose.yml ps
```

Ожидаемый результат: 4 контейнера в статусе `Up` (postgres, redis, minio, nats).

---

## 2. Проверка здоровья сервисов

```bash
# PostgreSQL
docker exec demo-project-postgres-1 pg_isready -U demo

# Redis
docker exec demo-project-redis-1 redis-cli ping

# MinIO
docker exec demo-project-minio-1 mc ready local

# NATS
docker exec demo-project-nats-1 wget -qO- http://localhost:8222/healthz
```

Ожидаемый результат:
- PG: `accepting connections`
- Redis: `PONG`
- MinIO: `OK`
- NATS: `ok`

---

## 3. Seed данных

```bash
# Заполнить MinIO и Redis тестовыми данными
npm run test:e2e:seed
```

Ожидаемый вывод:
```
Redis seeded: 5 keys
MinIO seeded: 5 files in bucket "demo-files"
Seed complete!
```

### Проверка данных в PostgreSQL

```bash
docker exec demo-project-postgres-1 psql -U demo -c "SELECT count(*) FROM users;"
# Результат: 5

docker exec demo-project-postgres-1 psql -U demo -c "SELECT count(*) FROM products;"
# Результат: 8

docker exec demo-project-postgres-1 psql -U demo -c "SELECT count(*) FROM orders;"
# Результат: 10
```

### Проверка данных в Redis

```bash
docker exec demo-project-redis-1 redis-cli GET "cache:users:list"
# JSON массив имён пользователей

docker exec demo-project-redis-1 redis-cli GET "config:app"
# {"version":"1.0.0","env":"demo","name":"demo-project"}
```

### Проверка файлов в MinIO

Открыть в браузере: http://localhost:9101 (MinIO Console)
- Логин: `minioadmin` / `minioadmin`
- Проверить bucket `demo-files` — должен содержать 5 файлов: report.pdf, data.csv, readme.md, config.json, logo.png

---

## 4. Запуск qoder-proxy

Перед запуском нужно создать YAML-конфиг проекта. Он уже лежит в `configs/demo-project.yaml` — проверь что путь к проекту указан правильно (абсолютный путь к `examples/demo-project`).

Также убедись что в `.env` указано:
```
PROJECTS_CONFIG_DIR=./configs
```

```bash
# Запустить прокси (инфраструктура уже должна работать)
npm run start:dev
```

Прокси запустится на http://localhost:3000.

В логах должно быть:
```
[project-config] Loaded 1 project(s): demo-project
```

Это значит что конфиг загружен и MCP-серверы для PG, Redis, MinIO, NATS будут доступны qodercli.

---

## 5. Проверка Plugin Storage (тесты 10.1–10.4)

### Создать плагин

```bash
curl http://localhost:3000/plugins/api/list
# Должен вернуть пустой массив: []
```

### Прямая проверка через SQLite

```bash
# Если есть sqlite3 CLI:
sqlite3 ./data/plugins.db "SELECT * FROM plugins;"
# Пусто на старте
```

> **Примечание**: Plugin Storage тестируется через e2e тесты напрямую (создание плагинов, версий, rollback, plugin_data). Вручную это проверяется через Dashboard UI или API — создание плагина происходит через qodercli (см. раздел 9).

---

## 6. Проверка Plugin Validation (тесты 11.1–11.3)

Это unit-тесты, не требуют инфраструктуры. Проверяются функции:
- `validateHtml()` — проверяет наличие `<html>`, `<body>`
- `validateJsSyntax()` — проверяет JS синтаксис через `node --check`
- `validateControllerContract()` — проверяет экспорт `meta`, `routes`, `init`

```bash
# Запустить unit-тесты валидации
npx jest --testPathPattern='tests/e2e' --forceExit -t "Plugin Validation"
```

---

## 7. Проверка OpenAPI Validation (тесты OpenAPI)

```bash
npx jest --testPathPattern='tests/e2e' --forceExit -t "OpenAPI Validation"
```

Или вручную — проверить что OpenAPI spec из `tests/e2e/fixtures/openapi/universal-search.yaml` содержит пути `/search`, `/search/more`, `/search/save`, `/search/saved`, `/search/saved/{id}`.

---

## 8. Проверка Plugin Loader (тесты 12.1–12.3)

После создания плагина (через Dashboard или API):

```bash
# Проверить что плагин отдаёт index.html
curl http://localhost:3000/plugins/<slug>/

# Проверить что API-роут плагина работает
curl http://localhost:3000/plugins/<slug>/ping
# Ожидаемый ответ: {"pong": true}
```

---

## 9. Проверка Plugin API (тесты 13.1–13.3)

```bash
# Список плагинов
curl http://localhost:3000/plugins/api/list

# Детали плагина
curl http://localhost:3000/plugins/api/<slug>

# Rollback на предыдущую версию
curl -X POST http://localhost:3000/plugins/api/<slug>/rollback \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 10. Проверка System Prompt (тест 15.1)

Системный промпт должен содержать секцию `## Available Plugins` со списком всех активных плагинов. Проверяется через запрос к `/v1/chat/completions` — в промпте, отправляемом в qodercli, должен быть каталог плагинов.

---

## 11. Проверка Playground (Dashboard)

1. Открыть http://localhost:3000/dashboard
2. Ввести пароль: `test`
3. Перейти в раздел **Playground**
4. Убедиться что:
   - По умолчанию выбрана модель **Lite** (free tier)
   - Можно отправить сообщение и получить ответ
   - Переключение между Stream / Non-stream работает

---

## 12. Проверка работы с реальной инфрой через MCP

Если qodercli доступен и есть `QODER_PERSONAL_ACCESS_TOKEN`:

```bash
# Убедись что .env содержит:
# QODER_PERSONAL_ACCESS_TOKEN=<your-token>
```

MCP-серверы которые подключаются к реальной инфре (из configs/demo-project.yaml):
- `pg_demo_project` — PostgreSQL (таблицы users, products, orders)
- `redis_demo_project` — Redis (кэш-ключи)
- `minio_demo_project` — MinIO (файлы в bucket demo-files)
- `nats_demo_project` — NATS
- `git_demo_project` — анализ исходного кода проекта
- `filesystem` — файловая система (путь к demo-project)

### Проверка через Playground

1. Открыть http://localhost:3000/dashboard
2. Перейти в Playground
3. Написать: **«Покажи всех пользователей из базы данных»**
4. qodercli должен через MCP-сервер `pg_demo_project` выполнить `SELECT * FROM users` и вернуть список

Другие запросы для проверки:
- **«Какие файлы есть в MinIO?»** — должен показать 5 файлов из bucket demo-files
- **«Что лежит в Redis?»** — должен показать кэш-ключи
- **«Проанализируй код проекта»** — должен описать gateway + microservice

---

## 13. Создание плагинов через qodercli (тесты 17.1, 18.1)

Для этих тестов нужны:
- Работающий Docker
- Установленный `qodercli` (`qodercli --version`)
- Переменная `QODER_PERSONAL_ACCESS_TOKEN`

### Universal Search плагин

Через Playground или API отправить запрос с OpenAPI-спекой из `tests/e2e/fixtures/openapi/universal-search.yaml`. Плагин должен создать контроллер с роутами: POST /search, GET /search/more, POST /search/save, GET /search/saved, DELETE /search/saved/:id.

### Photo Gallery плагин

Аналогично, со спекой из `tests/e2e/fixtures/openapi/photo-gallery.yaml`.

---

## 14. Запуск всех e2e тестов одной командой

```bash
npm run test:e2e
```

Ожидаемый результат: **23 passed**, ~6-12 секунд.

---

## 15. Очистка

```bash
# Остановить инфраструктуру и удалить volumes
npm run test:e2e:teardown

# Проверить что контейнеры удалены
docker ps | grep demo
# Пусто
```

---

## Быстрый чек-лист

| # | Что проверяем | Команда | Ожидаемый результат |
|---|--------------|---------|-------------------|
| 1 | Инфраstructure up | `npm run test:e2e:setup` | 4 контейнера Running |
| 2 | PG healthy | `docker exec demo-project-postgres-1 pg_isready -U demo` | accepting connections |
| 3 | Redis healthy | `docker exec demo-project-redis-1 redis-cli ping` | PONG |
| 4 | MinIO healthy | `docker exec demo-project-minio-1 mc ready local` | OK |
| 5 | NATS healthy | `docker exec demo-project-nats-1 wget -qO- http://localhost:8222/healthz` | ok |
| 6 | Seed выполнен | `npm run test:e2e:seed` | Redis 5 keys, MinIO 5 files |
| 7 | PG данные | `docker exec demo-project-postgres-1 psql -U demo -c "SELECT count(*) FROM users;"` | 5 |
| 8 | Redis данные | `docker exec demo-project-redis-1 redis-cli GET config:app` | JSON с version 1.0.0 |
| 9 | Все e2e тесты | `npm run test:e2e` | 23 passed |
| 10 | Очистка | `npm run test:e2e:teardown` | Контейнеры удалены |
