## Context

Проект — Express.js-прокси на JavaScript (CommonJS). Интеграционные тесты используют Jest + supertest. TypeScript-инструменты уже установлены: `typescript`, `ts-jest`, `@types/jest`, `@types/node`, `@types/express`, `@types/supertest`. Исходный код (`src/`) остаётся на JavaScript и не типизирован. Юнит-тесты (`tests/unit/`) остаются на JavaScript.

## Goals / Non-Goals

**Goals:**
- Все 7 интеграционных тестов + `setup.js` переписаны на TypeScript с строгой типизацией
- `tsconfig.json` настроен для компиляции тестовых `.ts` файлов с импортом JS-исходников
- Jest запускает `.test.ts` через `ts-jest`, `.test.js` — через стандартный трансформер
- Все 167 тестов проходят без изменения тестовой логики
- Типизация mock-объектов и supertest-ответов

**Non-Goals:**
- Миграция `src/` на TypeScript
- Миграция `tests/unit/` на TypeScript
- Создание `.d.ts` деклараций для `src/` модулей
- Изменение Dockerfile / CI

## Decisions

### 1. tsconfig.json — `allowJs` + `strict` + `module: commonjs`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["jest", "node"],
    "noEmit": true
  },
  "include": ["tests/**/*.ts"]
}
```

**Обоснование:**
- `allowJs: true` — позволяет `import` из `.ts` тестов обращаться к `.js` файлам `src/` без ошибок
- `strict: true` — максимальная типобезопасность для тестов
- `module: commonjs` — Jest работает в CJS-режиме, `ts-jest` компилирует в CJS
- `noEmit: true` — ts-jest компилирует на лету, отдельная сборка не нужна
- `types: ["jest", "node"]` — глобальные типы Jest и Node.js
- `include` ограничен `tests/**/*.ts` — не затрагивает `src/`

**Альтернативы:** Отдельный `tsconfig.test.json` — избыточно, т.к. `src/` не мигрируется.

### 2. Jest-конфигурация: два transform-правила

```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js", "**/tests/**/*.test.ts"],
  "transform": {
    "^.+\\.ts$": "ts-jest",
    "^.+\\.js$": "default"
  }
}
```

**Обоснование:** `.test.js` файлы (юнит-тесты) обрабатываются стандартно, `.test.ts` (интеграционные) — через ts-jest. Оба формата сосуществуют.

**Альтернативы:** Полная миграция всех тестов сразу — выходит за рамки задачи.

### 3. Стратегия типизации source-модулей

Поскольку `src/` остаётся на JavaScript, а `allowJs: true` разрешает импорт, TypeScript будет выводить типы из JS-файлов. Для `jest.mock()` используем:

```typescript
import { Express } from 'express';
import type { Response } from 'express';

// Типизация buildApp
interface BuildAppResult {
  app: Express;
  mocks: {
    mockRunQoderRequest: jest.Mock;
    mockCheckQoderCli: jest.Mock;
  };
  restoreEnv: () => void;
}

// Типизация mock-реализаций
mockRunQoderRequest.mockImplementation(({ onChunk, onDone }: {
  onChunk: (event: any) => void;
  onDone: (code: number, signal: string) => void;
}) => { ... });
```

**Обоснование:** `jest.Mock` даёт базовую типизацию. Параметры callback-ов типизируются inline. `Express` из `@types/express` покрывает тип приложения.

### 4. Порядок миграции файлов

1. `tsconfig.json` + jest-конфиг — инфраструктура
2. `setup.js` → `setup.ts` — базовый хелпер, от которого зависят все тесты
3. Тестовые файлы по одному: `public-routes` → `auth` → `models` → `misc` → `completions` → `chat-completions` → `dashboard`
4. После каждого файла — запуск тестов для проверки
5. Удаление старых `.js` файлов

**Обоснование:** Сначала инфраструктура, потом зависимости (setup), потом листы (тестовые файлы).

### 5. `import` вместо `require`

В `.ts` файлах используем ES-импорты:

```typescript
import request from 'supertest';
import { buildApp } from './setup';
```

**Обоснование:** `ts-jest` с `esModuleInterop: true` корректно обрабатывает CJS-экспорты через ES-импорты. Это идиоматичный TypeScript-стиль.

## Risks / Trade-offs

- **[Риск] `jest.mock()` с динамическими модулями** — `jest.resetModules()` + `jest.mock()` в setup создаёт свежие модули. TypeScript может не отследить типы через динамический require. → **Митигация:** типизировать mock-объекты через `jest.Mock` в `buildApp`, использовать `as` cast при необходимости.

- **[Риск] `requireActual` в mock-фабрике** — `jest.requireActual('../../src/helpers/spawn')` возвращает нетипизированный объект. → **Митигация:** обернуть результат в типизированный интерфейс или использовать `as unknown as`.

- **[Риск] `res.body` и `res.text` — supertest типы** — `@types/supertest` может не покрывать все поля. → **Митигация:** `res.body` типизирован как `any` по умолчанию в supertest — достаточно для тестов. При необходимости — cast через `as`.

- **[Trade-off] `strict: true` может потребовать больше `as` и `!`** — но это честная типизация, а не обход.
