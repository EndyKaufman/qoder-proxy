## 1. Инфраструктура TypeScript

- [x] 1.1 Создать `tsconfig.json` с настройками из design.md (`allowJs`, `strict`, `module: commonjs`, `noEmit`, `types: ["jest", "node"]`, `include: ["tests/**/*.ts"]`). Проверить: `npx tsc --noEmit` не выдаёт ошибок для пустого `include`.
- [x] 1.2 Обновить jest-конфигурацию в `package.json`: добавить `"**/tests/**/*.test.ts"` в `testMatch`, добавить `transform` с `"^.+\\.ts$": "ts-jest"`. Проверить: `npm test` по-прежнему запускает существующие `.test.js` файлы без ошибок.

## 2. Миграция setup.js → setup.ts

- [x] 2.1 Создать `tests/integration/setup.ts`: заменить `require` на ES-импорты, типизировать `buildApp` (параметры `envOverrides: Record<string, string | undefined>`, возврат `BuildAppResult` с `app: Express`, `mocks: { mockRunQoderRequest: jest.Mock; mockCheckQoderCli: jest.Mock }`, `restoreEnv: () => void`). Типизировать `jest.mock()` фабрику. Проверить: `npx tsc --noEmit` проходит для setup.ts.
- [x] 2.2 Удалить `tests/integration/setup.js`. Запустить `npm test` — убедиться, что интеграционные тесты по-прежнему находят setup через `.ts` файл (все 167 тестов проходят).

## 3. Миграция public-routes.test.js

- [x] 3.1 Создать `tests/integration/public-routes.test.ts`: заменить `require` на `import request from 'supertest'` и `import { buildApp } from './setup'`, типизировать переменные `app` и `mocks`. Проверить: тесты public-routes проходят.
- [x] 3.2 Удалить `tests/integration/public-routes.test.js`. Проверить: `npm test` — все тесты проходят.

## 4. Миграция auth.test.js

- [x] 4.1 Создать `tests/integration/auth.test.ts`: заменить `require` на ES-импорты, типизировать `createAppWithKey`, типизировать `jest.mock()` фабрику для spawn. Проверить: тесты auth проходят.
- [x] 4.2 Удалить `tests/integration/auth.test.js`. Проверить: `npm test` — все тесты проходят.

## 5. Миграция models.test.js

- [x] 5.1 Создать `tests/integration/models.test.ts`: заменить `require` на ES-импорты, типизировать переменные. Проверить: тесты models проходят.
- [x] 5.2 Удалить `tests/integration/models.test.js`. Проверить: `npm test` — все тесты проходят.

## 6. Миграция misc.test.js

- [x] 6.1 Создать `tests/integration/misc.test.ts`: заменить `require` на ES-импорты, типизировать переменные. Проверить: тесты misc проходят.
- [x] 6.2 Удалить `tests/integration/misc.test.js`. Проверить: `npm test` — все тесты проходят.

## 7. Миграция completions.test.js

- [x] 7.1 Создать `tests/integration/completions.test.ts`: заменить `require` на ES-импорты, типизировать `mockImplementation` callback-и (`onChunk`, `onDone` параметры). Проверить: тесты completions проходят.
- [x] 7.2 Удалить `tests/integration/completions.test.js`. Проверить: `npm test` — все тесты проходят.

## 8. Миграция chat-completions.test.js

- [x] 8.1 Создать `tests/integration/chat-completions.test.ts`: заменить `require` на ES-импорты, типизировать все `mockImplementation` callback-и, типизировать парсинг SSE-чанков. Проверить: тесты chat-completions проходят.
- [x] 8.2 Удалить `tests/integration/chat-completions.test.js`. Проверить: `npm test` — все тесты проходят.

## 9. Миграция dashboard.test.js

- [x] 9.1 Создать `tests/integration/dashboard.test.ts`: заменить `require` на ES-импорты, типизировать `createToken` (функция, возвращающая `string`), типизировать все переменные. Проверить: тесты dashboard проходят.
- [x] 9.2 Удалить `tests/integration/dashboard.test.js`. Проверить: `npm test` — все тесты проходят.

## 10. Финальная верификация

- [x] 10.1 Запустить `npm test` — все 167 тестов (14 suite'ов) проходят, включая юнит-тесты на JS и интеграционные на TS. Проверить: `npx tsc --noEmit` не выдаёт ошибок компиляции.
- [x] 10.2 Запустить `node src/server.js` — сервер стартует корректно, исходный код не затронут.
