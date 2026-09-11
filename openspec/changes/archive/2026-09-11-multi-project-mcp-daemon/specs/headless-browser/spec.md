## Purpose

Headless-браузер на базе Playwright MCP для навигации по веб-сайтам, создания скриншотов, загрузки и скачивания файлов. Доступен AI-агенту через MCP-сервер для инспекции веб-страниц, тестирования и работы с файлами.

## ADDED Requirements

### Requirement: Playwright MCP сервер в конфигурации демона
Система SHALL включать MCP-сервер `playwright` (пакет `@playwright/mcp`) в генерируемый MCP JSON для демона. Сервер доступен глобально (без префикса проекта), так как браузер не привязан к конкретному проекту.

#### Scenario: Playwright доступен в MCP
- **WHEN** демон запущен с проектами
- **THEN** в MCP JSON присутствует сервер `playwright` с `command: "npx"`, `args: ["-y", "@playwright/mcp"]`

### Requirement: Навигация и скриншоты
AI-агент SHALL иметь возможность через Playwright MCP: открывать URL, переходить по страницам, кликать элементы, заполнять формы, делать скриншоты.

#### Scenario: Скриншот страницы
- **WHEN** пользователь просит "сделай скриншот https://example.com"
- **THEN** AI использует Playwright MCP для навигации на URL и создания скриншота

#### Scenario: Заполнение формы
- **WHEN** пользователь просит "зайди на сайт и заполни форму логина"
- **THEN** AI использует Playwright MCP для навигации, поиска полей и заполнения

### Requirement: Загрузка и скачивание файлов
AI-агент SHALL иметь возможность загружать файлы на веб-страницы (file upload) и скачивать файлы с веб-страниц.

#### Scenario: Скачивание файла
- **WHEN** пользователь просит "скачай PDF с страницы /documents"
- **THEN** AI использует Playwright MCP для навигации и скачивания файла

#### Scenario: Загрузка файла на страницу
- **WHEN** пользователь просит "загрузи файл /projects/alpha/data.csv на форму"
- **THEN** AI использует Playwright MCP для загрузки файла через file input элемент

### Requirement: Headless режим
Playwright MCP SHALL работать в headless-режиме (без GUI). Docker-образ должен содержать Chromium и зависимости.

#### Scenario: Headless в Docker
- **WHEN** контейнер запущен без display
- **THEN** Playwright работает в headless-режиме, скриншоты создаются корректно
