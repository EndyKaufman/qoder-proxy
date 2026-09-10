const {
  buildPromptWithTools,
  parseToolCallFromText,
  toOpenAIToolCalls,
} = require('../../../src/helpers/toolPrompt');

// Access the internal buildToolSystemPrompt via buildPromptWithTools behavior
// We test it indirectly through buildPromptWithTools

// ── buildPromptWithTools (includes buildToolSystemPrompt) ────────────────────

describe('buildPromptWithTools', () => {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    },
  ];

  test('generates prompt with tool instructions when tools provided', () => {
    const messages = [{ role: 'user', content: 'What is the weather?' }];
    const result = buildPromptWithTools(messages, tools, (msgs) => msgs.map(m => m.content).join('\n'));
    expect(result).toContain('get_weather');
    expect(result).toContain('Get weather for a city');
    expect(result).toContain('tool_call');
    expect(result).toContain('What is the weather?');
  });

  test('delegates to messagesToPrompt when no tools', () => {
    const mockFn = jest.fn(() => 'delegated');
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = buildPromptWithTools(messages, [], mockFn);
    expect(result).toBe('delegated');
    expect(mockFn).toHaveBeenCalledWith(messages);
  });

  test('delegates to messagesToPrompt when tools is null', () => {
    const mockFn = jest.fn(() => 'delegated');
    const result = buildPromptWithTools([], null, mockFn);
    expect(result).toBe('delegated');
  });

  test('includes system message from messages', () => {
    const messages = [
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'Hi' },
    ];
    const result = buildPromptWithTools(messages, tools, () => '');
    expect(result).toContain('System context: Be helpful');
  });

  test('handles multipart system content', () => {
    const messages = [
      { role: 'system', content: [{ type: 'text', text: 'Sys msg' }] },
      { role: 'user', content: 'Hi' },
    ];
    const result = buildPromptWithTools(messages, tools, () => '');
    expect(result).toContain('System context: Sys msg');
  });

  test('includes conversation history with role labels', () => {
    const messages = [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ];
    const result = buildPromptWithTools(messages, tools, () => '');
    expect(result).toContain('User: Q1');
    expect(result).toContain('Assistant: A1');
    expect(result).toContain('User: Q2');
  });

  test('includes tool role messages', () => {
    const messages = [
      { role: 'tool', content: 'Tool result data' },
    ];
    const result = buildPromptWithTools(messages, tools, () => '');
    expect(result).toContain('Tool result: Tool result data');
  });
});

// ── parseToolCallFromText ────────────────────────────────────────────────────

describe('parseToolCallFromText', () => {
  test('extracts raw JSON tool call', () => {
    const text = '{"tool_call":{"name":"get_weather","arguments":{"city":"London"}}}';
    const result = parseToolCallFromText(text);
    expect(result).toEqual({ name: 'get_weather', arguments: { city: 'London' } });
  });

  test('extracts tool call from markdown code fence', () => {
    const text = '```json\n{"tool_call":{"name":"fn","arguments":{}}}\n```';
    const result = parseToolCallFromText(text);
    expect(result).toEqual({ name: 'fn', arguments: {} });
  });

  test('returns null for plain text without tool_call', () => {
    expect(parseToolCallFromText('Just a normal response')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseToolCallFromText('')).toBeNull();
  });

  test('returns null for null/undefined', () => {
    expect(parseToolCallFromText(null)).toBeNull();
    expect(parseToolCallFromText(undefined)).toBeNull();
  });

  test('returns null for invalid JSON containing tool_call', () => {
    expect(parseToolCallFromText('{"tool_call": invalid}')).toBeNull();
  });

  test('handles tool call with string arguments', () => {
    const text = '{"tool_call":{"name":"fn","arguments":"{\\"a\\":1}"}}';
    const result = parseToolCallFromText(text);
    expect(result).not.toBeNull();
    expect(result.name).toBe('fn');
  });

  test('extracts tool call embedded in surrounding text', () => {
    const text = 'Here is my call: {"tool_call":{"name":"do_thing","arguments":{"x":1}}} and that is it.';
    const result = parseToolCallFromText(text);
    expect(result).toEqual({ name: 'do_thing', arguments: { x: 1 } });
  });
});

// ── toOpenAIToolCalls ────────────────────────────────────────────────────────

describe('toOpenAIToolCalls', () => {
  test('formats tool call in OpenAI format', () => {
    const toolCall = { name: 'get_weather', arguments: { city: 'London' } };
    const result = toOpenAIToolCalls(toolCall, 'call_123');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'call_123',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: JSON.stringify({ city: 'London' }),
      },
    });
  });

  test('keeps string arguments as-is', () => {
    const toolCall = { name: 'fn', arguments: '{"a":1}' };
    const result = toOpenAIToolCalls(toolCall, 'call_456');
    expect(result[0].function.arguments).toBe('{"a":1}');
  });

  test('stringifies object arguments', () => {
    const toolCall = { name: 'fn', arguments: { key: 'value' } };
    const result = toOpenAIToolCalls(toolCall, 'call_789');
    expect(result[0].function.arguments).toBe('{"key":"value"}');
  });
});
