# Локальный запуск qoder-proxy в режиме разработки

## 1. Предварительные требования

- **Node.js** >= 18.0.0
- **qodercli** — CLI-клиент Qoder, должен быть доступен в PATH

Проверь наличие qodercli:

```bash
qodercli --help
```

Если не установлен:

```bash
npm install -g @qoder-ai/qodercli
```

## 2. Получи Personal Access Token

Зайди на [https://qoder.com/account/integrations](https://qoder.com/account/integrations) и сгенерируй PAT (Personal Access Token). Он нужен для авторизации qodercli.

## 3. Установи зависимости

```bash
cd /home/endy/Projects/qoder-proxy
npm install
```

## 4. Создай `.env` файл

Скопируй пример и заполни свои значения:

```bash
cp .env.example .env
```

Минимально необходимые переменные для разработки:

```env
PORT=3000

# Токен авторизации qodercli (обязательно!)
QODER_PERSONAL_ACCESS_TOKEN=твой-pat-тут

# Ключ для защиты API (для локалки можно не ставить — тогда auth отключён)
PROXY_API_KEY=your-secret-proxy-key

# Дашборд
DASHBOARD_ENABLED=true
DASHBOARD_PASSWORD=test
DASHBOARD_SECRET=any-random-string

# CORS — для локалки разрешаем всё
CORS_ORIGIN=*
```

## 5. Запусти в режиме разработки (watch mode)

```bash
npm run start:dev
```

При успешном старте увидишь:

```
🚀 Qoder OpenAI Proxy  →  http://localhost:3000
   Auth     : Enabled (Bearer token)
   Dashboard: http://localhost:3000/dashboard/
   CORS     : *
   Timeout  : 120000ms
   Swagger  : http://localhost:3000/api/docs
```

## 6. Проверь что всё работает

### 6.1. Проверка списка моделей

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer your-secret-proxy-key" | jq '.data[].id'
```

Должен вернуть список моделей, включая `auto`, `ultimate`, `performance`, `qmodel` и алиасы.

### 6.2. Проверка Chat Completion (модель `auto` = Lite)

В текущей конфигурации `lite` маппится на `auto`. Запрос:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-proxy-key" \
  -d '{
    "model": "auto",
    "messages": [
      {"role": "user", "content": "Привет! Скажи hello"}
    ],
    "stream": false
  }'
```

Ожидаемый ответ — JSON в формате OpenAI с полем `choices[0].message.content`.

### 6.3. Проверка streaming

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-proxy-key" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Расскажи анекдот"}],
    "stream": true
  }'
```

Должны идти SSE-чанки `data: {...}` в реальном времени, завершающиеся `data: [DONE]`.

### 6.4. Проверка через Swagger UI

Открой в браузере [http://localhost:3000/api/docs](http://localhost:3000/api/docs) — там можно отправить запросы прямо из интерфейса.

### 6.5. Дашборд

Открой [http://localhost:3000/dashboard/](http://localhost:3000/dashboard/) и войди с паролем из `.env` (в примере — `test`). Внутри есть Playground для тестирования и логи запросов.

## 7. Отладка (debug mode)

Если нужен дебаггер:

```bash
npm run start:debug
```

Это запустит NestJS с `--debug --watch`, можно подключиться через VS Code / Chrome DevTools.

## 8. Запуск тестов

```bash
npm test
```

---

**Модель Lite:** прокси передаёт `--model lite` в qodercli как есть. Передавай `"model": "lite"` в запросах.
