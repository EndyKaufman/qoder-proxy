## Purpose

Обеспечивает юнит-тесты для всех вспомогательных функций (helpers) проекта — маппинг моделей, парсинг сообщений, построение ответов, обработка tool calls и парсинг потока qodercli.

## Requirements

### Requirement: Тесты getModelMapping
Система ДОЛЖНА предоставлять юнит-тесты для функции `getModelMapping`, проверяющие все варианты разрешения имён моделей.

#### Scenario: Прямые qodercli-идентификаторы проходят без изменений
- **WHEN** вызвана `getModelMapping("auto")`
- **THEN** результат ДОЛЖЕН быть `"auto"`

#### Scenario: OpenAI-алиасы маппятся на корректный тир
- **WHEN** вызвана `getModelMapping("gpt-4")`
- **THEN** результат ДОЛЖЕН быть `"auto"`

#### Scenario: Claude-алиасы маппятся корректно
- **WHEN** вызвана `getModelMapping("claude-3-opus")`
- **THEN** результат ДОЛЖЕН быть `"ultimate"`

#### Scenario: Неизвестная модель падает обратно на auto
- **WHEN** вызвана `getModelMapping("unknown-model-xyz")`
- **THEN** результат ДОЛЖЕН быть `"auto"`

#### Scenario: Пустая модель возвращает auto
- **WHEN** вызвана `getModelMapping(undefined)`
- **THEN** результат ДОЛЖЕН быть `"auto"`

#### Scenario: Частичное совпадение по имени семейства
- **WHEN** вызвана `getModelMapping("claude-4-something")`
- **THEN** результат ДОЛЖЕН содержать корректный маппинг по эвристике `claude`

### Requirement: Тесты messagesToPrompt
Система ДОЛЖНА предоставлять юнит-тесты для конвертации массива сообщений в промпт.

#### Scenario: Одно пользовательское сообщение
- **WHEN** вызвана `messagesToPrompt([{role: "user", content: "Hello"}])`
- **THEN** результат ДОЛЖЕН содержать `"User: Hello"`

#### Scenario: Системное сообщение включается
- **WHEN** вызвана с системным и пользовательским сообщением
- **THEN** результат ДОЛЖЕН начинаться с `"System: ..."`

#### Scenario: Пустой массив возвращает "Hello"
- **WHEN** вызвана `messagesToPrompt([])`
- **THEN** результат ДОЛЖЕН быть `"Hello"`

#### Scenario: История ограничена 10 последними сообщениями
- **WHEN** передано 15 пользовательских сообщений
- **THEN** в промпте ДОЛЖНЫ быть только последние 10

#### Scenario: Массив content (multipart) корректно извлекается
- **WHEN** сообщение содержит `content: [{type: "text", text: "Hello"}]`
- **THEN** текст ДОЛЖЕН быть извлечён как `"Hello"`

### Requirement: Тесты extractTextContent
Система ДОЛЖНА предоставлять юнит-тесты для извлечения текста из объектов qodercli-сообщений.

#### Scenario: Строковый content
- **WHEN** `message.content` — строка
- **THEN** результат ДОЛЖЕН быть этой строкой

#### Scenario: Массив content с текстовыми частями
- **WHEN** `message.content` — массив `{type: "text", text: "..."}`
- **THEN** результат ДОЛЖЕН быть конкатенацией всех текстов

#### Scenario: Пустой/null message
- **WHEN** message равен null или undefined
- **THEN** результат ДОЛЖЕН быть пустой строкой

#### Scenario: Content с частями value/text
- **WHEN** части содержат `part.value` и `part.text`
- **THEN** ДОЛЖНЫ быть извлечены оба значения

### Requirement: Тесты extractToolCalls
Система ДОЛЖНА предоставлять юнит-тесты для извлечения tool calls из content-массива.

#### Scenario: Content с function-элементами
- **WHEN** content содержит `{type: "function", id, name, input}`
- **THEN** результат ДОЛЖЕН содержать массив tool calls в OpenAI-формате

#### Scenario: Content без function-элементов
- **WHEN** content не содержит элементов типа "function"
- **THEN** результат ДОЛЖЕН быть null

#### Scenario: Не-массив content
- **WHEN** content не является массивом
- **THEN** результат ДОЛЖЕН быть null

### Requirement: Тесты newId
Система ДОЛЖНА предоставлять юнит-тесты для генерации ID.

#### Scenario: ID имеет корректный префикс
- **WHEN** вызвана `newId("chatcmpl")`
- **THEN** результат ДОЛЖЕН начинаться с `"chatcmpl-"`

#### Scenario: ID уникальны
- **WHEN** вызвана `newId` дважды
- **THEN** результаты ДОЛЖНЫ различаться

### Requirement: Тесты build-функций для ответов
Система ДОЛЖНА предоставлять юнит-тесты для всех `build*` функций, проверяющие структуру возвращаемых объектов.

#### Scenario: buildStreamChunk возвращает корректный формат
- **WHEN** вызвана `buildStreamChunk("hello", "auto", "id1")`
- **THEN** результат ДОЛЖЕН содержать `object: "chat.completion.chunk"`, `choices[0].delta.content: "hello"`

#### Scenario: buildDoneChunk содержит finish_reason
- **WHEN** вызвана `buildDoneChunk("auto", "id1", "stop")`
- **THEN** `choices[0].finish_reason` ДОЛЖЕН быть `"stop"`

#### Scenario: buildFullChatResponse возвращает полный ответ
- **WHEN** вызвана `buildFullChatResponse("text", "auto", "stop", "id1")`
- **THEN** результат ДОЛЖЕН содержать `object: "chat.completion"`, `choices[0].message.content: "text"`, `usage`

#### Scenario: buildFullChatResponseWithTools содержит tool_calls
- **WHEN** вызвана с массивом tool calls
- **THEN** `choices[0].message.tool_calls` ДОЛЖЕН содержать переданные tool calls

#### Scenario: buildCompletionStreamChunk возвращает text_completion_chunk
- **WHEN** вызвана `buildCompletionStreamChunk("text", "auto", "id1")`
- **THEN** `object` ДОЛЖЕН быть `"text_completion_chunk"`

#### Scenario: buildFullCompletionResponse возвращает text_completion
- **WHEN** вызвана `buildFullCompletionResponse("text", "auto", "stop", "id1")`
- **THEN** `object` ДОЛЖЕН быть `"text_completion"`

### Requirement: Тесты toolPrompt функций
Система ДОЛЖНА предоставлять юнит-тесты для `buildToolSystemPrompt`, `buildPromptWithTools`, `parseToolCallFromText`, `toOpenAIToolCalls`.

#### Scenario: buildToolSystemPrompt генерирует инструкции
- **WHEN** передан массив tools
- **THEN** результат ДОЛЖЕН содержать имена функций и JSON-схемы параметров

#### Scenario: buildPromptWithTools добавляет системный блок
- **WHEN** переданы messages и tools
- **THEN** промпт ДОЛЖЕН начинаться с инструкций по tools

#### Scenario: parseToolCallFromText извлекает JSON tool call
- **WHEN** текст содержит `{"tool_call":{"name":"fn","arguments":{}}}`
- **THEN** результат ДОЛЖЕН содержать `{name: "fn", arguments: {}}`

#### Scenario: parseToolCallFromText возвращает null для обычного текста
- **WHEN** текст не содержит tool_call JSON
- **THEN** результат ДОЛЖЕН быть null

#### Scenario: parseToolCallFromText обрабатывает markdown-обёртку
- **WHEN** текст содержит JSON в markdown code fence
- **THEN** tool call ДОЛЖЕН быть извлечён

#### Scenario: toOpenAIToolCalls формирует OpenAI-формат
- **WHEN** передан toolCall и callId
- **THEN** результат ДОЛЖЕН быть массивом с `id`, `type: "function"`, `function.name`, `function.arguments`

### Requirement: Тесты spawn helpers
Система ДОЛЖНА предоставлять юнит-тесты для внутренних функций spawn.js — `extractEventText`, `hasVisibleAssistantText`, `deepFindText`.

#### Scenario: extractEventText извлекает строковый content
- **WHEN** `data.message.content` — строка
- **THEN** результат ДОЛЖЕН быть этой строкой

#### Scenario: extractEventText извлекает массив content
- **WHEN** `data.message.content` — массив текстовых частей
- **THEN** результат ДОЛЖЕН быть конкатенацией

#### Scenario: extractEventText обрабатывает data.result
- **WHEN** `data.result` — строка
- **THEN** результат ДОЛЖЕН быть `data.result`

#### Scenario: hasVisibleAssistantText определяет непустой текст
- **WHEN** message содержит видимый текст
- **THEN** результат ДОЛЖЕН быть true

#### Scenario: hasVisibleAssistantText возвращает false для пустого
- **WHEN** message пуст или содержит только пробелы
- **THEN** результат ДОЛЖЕН быть false

#### Scenario: deepFindText находит текст в вложенных объектах
- **WHEN** объект содержит вложенное поле `text`
- **THEN** результат ДОЛЖЕН содержать найденный текст
