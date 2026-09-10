## Why

Интеграционные тесты написаны на JavaScript и не используют строгую типизацию. Перевод тестов на TypeScript позволяет проверить контракты API (типы запросов, ответов, структуру SSE-чанков) на уровне типов, обнаружить несоответствия до запуска тестов и создать фундамент для дальнейшей миграции всего проекта на TypeScript. TypeScript-инструменты (ts-jest, @types/jest, @types/supertest, @types/express, typescript) уже установлены в devDependencies.

## What Changes

- Конфигурация `tsconfig.json` для компиляции тестовых файлов
- Настройка `ts-jest` в конфигурации Jest для запуска `.test.ts` файлов
- Обновление `package.json` — добавление скрипта и расширение `testMatch` на `.test.ts`
- Миграция `tests/integration/setup.js` → `tests/integration/setup.ts` с типизацией `buildApp`, mock-объектов и возвращаемых значений
- Миграция 7 файлов интеграционных тестов из `.js` в `.ts`:
  - `public-routes.test.js` → `public-routes.test.ts`
  - `auth.test.js` → `auth.test.ts`
  - `chat-completions.test.js` → `chat-completions.test.ts`
  - `completions.test.js` → `completions.test.ts`
  - `models.test.js` → `models.test.ts`
  - `misc.test.js` → `misc.test.ts`
  - `dashboard.test.js` → `dashboard.test.ts`
- Добавление типов для `supertest`-ответов (`res.body`, `res.status`, `res.headers`)
- Типизация mock-объектов (`jest.Mock`, `mockRunQoderRequest`, `mockCheckQoderCli`)
- Удаление старых `.js` файлов после миграции

## Capabilities

### New Capabilities

_Нет новых поведенческих контрактов — это миграция языка тестов без изменения функциональности._

### Modified Capabilities

_Нет изменений требований — тесты проверяют те же контракты, просто на TypeScript._

## Impact

- **Тесты**: все 7 интеграционных тестовых файлов + setup.js переходят на TypeScript
- **Конфигурация**: добавляется `tsconfig.json`, обновляется jest-конфиг в `package.json`
- **Зависимости**: новые пакеты не требуются — всё уже установлено (typescript, ts-jest, @types/*)
- **Юнит-тесты**: не затрагиваются — остаются на JavaScript (миграция только интеграционных)
- **Исходный код (src/)**: не изменяется — остаётся на JavaScript
- **Непрерывная интеграция**: Dockerfile и CI не требуют изменений, т.к. тесты компилируются ts-jest на лету
