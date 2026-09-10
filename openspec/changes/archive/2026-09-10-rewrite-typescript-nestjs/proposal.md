## Зачем

Текущая кодовая база — это обычное Node.js/Express приложение на JavaScript с CommonJS модулями. По мере роста проекта отсутствие статической типизации, внедрения зависимостей и структурированной архитектуры усложняет поддержку и повышает риск ошибок во время выполнения. Переписывание на TypeScript с NestJS даёт типовую безопасность, модульную архитектуру с DI, встроенную валидацию и лучшую долгосрочную сопровождаемость — при сохранении абсолютно идентичного внешнего API.

## Что меняется

- **BREAKING** (на уровне сборки): Все исходные файлы мигрируют с `.js` (CommonJS) на `.ts` (ESM/CJS через тулчейн NestJS). Точка входа меняется с `node src/server.js` на скомпилированный bootstrap NestJS.
- Замена ручного роутинга Express на контроллеры NestJS с одним AppModule (без отдельных feature-модулей).
- Введение TypeScript интерфейсов для всех форматов запросов/ответов (OpenAI chat completions, completions, models, tool calls).
- Замена ручных middleware (auth, logger, dashboard auth) на guard'ы, interceptor'ы и middleware NestJS.
- Замена самописного модуля конфигурации на типизированный `ConfigModule` через `@nestjs/config` с валидацией через Joi/class-validator.
- Замена обёрток над `child_process.spawn` на типизированный провайдер `QoderCliService`.
- Замена in-memory `logStore` на типизированный `LogStoreService`, зарегистрированный как провайдер NestJS.
- Подключение Swagger-документации через `@nestjs/swagger` — все DTO с OpenAPI-декораторами (`@ApiProperty()`), Swagger UI по `/api/docs`.
- Добавление `tsconfig.json`, конвейера сборки (`tsc` или `@nestjs/cli`), обновление скриптов `package.json`.
- Обновление `Dockerfile` для сборки TypeScript и запуска скомпилированного кода.
- Фронтенд админ-панели (статические HTML/JS/CSS) остаётся без изменений — меняется только бэкенд, который его отдаёт.
- Миграция 7 unit-тестов (`tests/unit/**/*.test.js`) на TypeScript (`tests/unit/**/*.test.ts`) с типизированными импортами из нового TS-кода. Integration-тесты уже на TS и не требуют изменений.

## Возможности

### Новые возможности

_Нет_ — это чистый внутренний рефакторинг. Внешне наблюдаемое поведение API не меняется.

### Изменённые возможности

_Нет_ — существующие specs описывают тестовые контракты (api-integration-tests, unit-tests-helpers, unit-tests-middleware, unit-tests-store). Поведенческие требования не меняются, поэтому delta specs не нужны.

**Примечание**: `skip_specs: true` установлен в `.openspec.yaml`, потому что это чистый рефакторинг без изменений внешне наблюдаемого поведения. Все конечные точки API, форматы запросов/ответов, поведение стриминга, форматы ошибок и UI дашборда остаются идентичными.

## Влияние

- **Зависимости**: Удалить `express`, `cors`, `uuid`, `dotenv`. Добавить `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/serve-static`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`, а также dev-зависимости (`typescript`, `@nestjs/cli`, `ts-node`, `@types/*`).
- **Сборка**: Новый шаг `npm run build` (`nest build` или `tsc`). `npm start` запускает скомпилированный JS из `dist/`. `npm run dev` использует `nest start --watch` или `ts-node-dev`.
- **Dockerfile**: Необходимо добавить стадию сборки (`npm ci && npm run build`) и изменить `CMD` на `node dist/main.js`.
- **Поверхность API**: Нулевых изменений — все маршруты (`GET /`, `GET /health`, `POST /v1/chat/completions`, `POST /v1/completions`, `GET /v1/models`, `POST /v1/embeddings`, маршруты дашборда) остаются идентичными по поведению.
- **Переменные окружения**: Идентичный набор, без переименований.
- **Тесты**: Существующие 167 тестов (Jest + supertest, JS) мигрируют на TypeScript. Тестовые файлы `tests/**/*.js` переписываются как `tests/**/*.ts`, конфигурация Jest обновляется для работы с TS через `ts-jest`. Это позволит использовать типизированные импорты из основного кода и обеспечит дополнительную проверку контрактов.
