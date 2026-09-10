import {
  messagesToPrompt,
  extractTextContent,
  extractToolCalls,
  newId,
  buildStreamChunk,
  buildDoneChunk,
  buildFullChatResponse,
  buildFullChatResponseWithTools,
  buildCompletionStreamChunk,
  buildFullCompletionResponse,
} from '../../../src/utils/format';
import { getModelMapping, QODER_MODELS } from '../../../src/qoder-cli/qoder-cli.models';

// ── getModelMapping ──────────────────────────────────────────────────────────

describe('getModelMapping', () => {
  test('returns "auto" for undefined model', () => {
    expect(getModelMapping(undefined)).toBe('auto');
  });

  test('returns "auto" for empty string', () => {
    expect(getModelMapping('')).toBe('auto');
  });

  test('passes through direct qodercli IDs', () => {
    expect(getModelMapping('auto')).toBe('auto');
    expect(getModelMapping('ultimate')).toBe('ultimate');
    expect(getModelMapping('performance')).toBe('performance');
    expect(getModelMapping('qmodel')).toBe('qmodel');
    expect(getModelMapping('kmodel')).toBe('kmodel');
    expect(getModelMapping('dmodel')).toBe('dmodel');
  });

  test('maps OpenAI aliases correctly', () => {
    expect(getModelMapping('gpt-4')).toBe('auto');
    expect(getModelMapping('gpt-4o')).toBe('auto');
    expect(getModelMapping('gpt-4o-mini')).toBe('auto');
    expect(getModelMapping('gpt-3.5-turbo')).toBe('auto');
    expect(getModelMapping('o1')).toBe('ultimate');
    expect(getModelMapping('o1-mini')).toBe('performance');
    expect(getModelMapping('o3-mini')).toBe('performance');
  });

  test('maps Claude aliases correctly', () => {
    expect(getModelMapping('claude-3-opus')).toBe('ultimate');
    expect(getModelMapping('claude-3-sonnet')).toBe('performance');
    expect(getModelMapping('claude-3-haiku')).toBe('auto');
    expect(getModelMapping('claude-3.5-sonnet')).toBe('auto');
    expect(getModelMapping('claude-3.7-sonnet')).toBe('auto');
  });

  test('maps Gemini aliases correctly', () => {
    expect(getModelMapping('gemini-pro')).toBe('performance');
    expect(getModelMapping('gemini-flash')).toBe('efficient');
  });

  test('maps friendly names correctly', () => {
    expect(getModelMapping('qwen')).toBe('qmodel');
    expect(getModelMapping('deepseek')).toBe('dmodel');
    expect(getModelMapping('deepseek-v4')).toBe('dmodel');
    expect(getModelMapping('deepseek-v4-flash')).toBe('dfmodel');
    expect(getModelMapping('glm')).toBe('gm51model');
    expect(getModelMapping('kimi')).toBe('kmodel');
    expect(getModelMapping('minimax')).toBe('mmodel');
  });

  test('falls back to "auto" for unknown model', () => {
    expect(getModelMapping('unknown-model-xyz')).toBe('auto');
  });

  test('uses heuristic partial matching for Claude family', () => {
    expect(getModelMapping('claude-4-something')).toBe('auto');
    expect(getModelMapping('claude-3-opus-new')).toBe('ultimate');
  });

  test('uses heuristic partial matching for GPT family', () => {
    expect(getModelMapping('gpt-4-something')).toBe('auto');
    expect(getModelMapping('gpt-3-new')).toBe('auto');
  });

  test('uses heuristic matching for Qwen family', () => {
    expect(getModelMapping('qwen-3.6-plus')).toBe('qmodel');
  });

  test('uses heuristic matching for DeepSeek family', () => {
    expect(getModelMapping('deepseek-v4-pro')).toBe('dmodel');
    expect(getModelMapping('deepseek-v4-flash')).toBe('dfmodel');
  });

  test('uses heuristic matching for GLM family', () => {
    expect(getModelMapping('glm-5.1')).toBe('gm51model');
  });
});

// ── messagesToPrompt ─────────────────────────────────────────────────────────

describe('messagesToPrompt', () => {
  test('converts single user message', () => {
    const result = messagesToPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toContain('User: Hello');
  });

  test('includes system message', () => {
    const result = messagesToPrompt([
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(result).toMatch(/^System: Be helpful/);
    expect(result).toContain('User: Hi');
  });

  test('returns "Hello" for empty array', () => {
    expect(messagesToPrompt([])).toBe('Hello');
  });

  test('returns "Hello" for undefined', () => {
    expect(messagesToPrompt(undefined)).toBe('Hello');
  });

  test('limits history to last 10 messages', () => {
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 15; i++) {
      messages.push({ role: 'user', content: `msg${i}` });
    }
    const result = messagesToPrompt(messages as any);
    expect(result).not.toContain('msg0');
    expect(result).not.toContain('msg4');
    expect(result).toContain('msg5');
    expect(result).toContain('msg14');
  });

  test('handles multipart content array', () => {
    const result = messagesToPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }] },
    ]);
    expect(result).toContain('User: Hello world');
  });

  test('handles assistant messages in history', () => {
    const result = messagesToPrompt([
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
    ]);
    expect(result).toContain('User: Question');
    expect(result).toContain('Assistant: Answer');
  });
});

// ── extractTextContent ───────────────────────────────────────────────────────

describe('extractTextContent', () => {
  test('extracts string content', () => {
    expect(extractTextContent({ content: 'hello' })).toBe('hello');
  });

  test('extracts from array of text parts', () => {
    const msg = { content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }] };
    expect(extractTextContent(msg)).toBe('hello world');
  });

  test('returns empty string for null message', () => {
    expect(extractTextContent(null)).toBe('');
  });

  test('returns empty string for undefined message', () => {
    expect(extractTextContent(undefined)).toBe('');
  });

  test('handles parts with value field', () => {
    const msg = { content: [{ value: 'val' }, { text: 'txt' }] };
    expect(extractTextContent(msg)).toBe('valtxt');
  });

  test('handles mixed part types', () => {
    const msg = { content: ['plain', { text: 'obj' }, { value: 'v' }] } as any;
    expect(extractTextContent(msg)).toBe('plainobjv');
  });

  test('returns empty string for non-string non-array content', () => {
    expect(extractTextContent({ content: 123 as any })).toBe('');
  });
});

// ── extractToolCalls ─────────────────────────────────────────────────────────

describe('extractToolCalls', () => {
  test('extracts function tool calls from content array', () => {
    const content = [
      { type: 'function', id: 'call_1', name: 'get_weather', input: { city: 'London' } },
    ];
    const result = extractToolCalls(content);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'get_weather', arguments: { city: 'London' } },
    });
  });

  test('returns null for content without function elements', () => {
    const content = [{ type: 'text', text: 'hello' }];
    expect(extractToolCalls(content)).toBeNull();
  });

  test('returns null for non-array content', () => {
    expect(extractToolCalls('string' as any)).toBeNull();
    expect(extractToolCalls(null)).toBeNull();
    expect(extractToolCalls(undefined)).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(extractToolCalls([])).toBeNull();
  });

  test('extracts multiple tool calls', () => {
    const content = [
      { type: 'function', id: 'c1', name: 'fn1', input: {} },
      { type: 'function', id: 'c2', name: 'fn2', input: { a: 1 } },
    ];
    const result = extractToolCalls(content);
    expect(result).toHaveLength(2);
  });
});

// ── newId ────────────────────────────────────────────────────────────────────

describe('newId', () => {
  test('has correct prefix', () => {
    expect(newId('chatcmpl')).toMatch(/^chatcmpl-/);
    expect(newId('cmpl')).toMatch(/^cmpl-/);
  });

  test('generates unique IDs', () => {
    const id1 = newId('test');
    const id2 = newId('test');
    expect(id1).not.toBe(id2);
  });
});

// ── buildStreamChunk ─────────────────────────────────────────────────────────

describe('buildStreamChunk', () => {
  test('returns correct chat.completion.chunk format', () => {
    const chunk = buildStreamChunk('hello', 'auto', 'id1');
    expect(chunk.object).toBe('chat.completion.chunk');
    expect(chunk.id).toBe('id1');
    expect(chunk.model).toBe('auto');
    expect(chunk.choices[0].index).toBe(0);
    expect(chunk.choices[0].delta.content).toBe('hello');
    expect(chunk.choices[0].delta.role).toBe('assistant');
    expect(chunk.choices[0].finish_reason).toBeNull();
    expect(typeof chunk.created).toBe('number');
  });
});

// ── buildDoneChunk ───────────────────────────────────────────────────────────

describe('buildDoneChunk', () => {
  test('contains finish_reason', () => {
    const chunk = buildDoneChunk('auto', 'id1', 'stop');
    expect(chunk.choices[0].finish_reason).toBe('stop');
    expect(chunk.choices[0].delta).toEqual({});
  });

  test('defaults to "stop"', () => {
    const chunk = buildDoneChunk('auto', 'id1');
    expect(chunk.choices[0].finish_reason).toBe('stop');
  });

  test('supports "tool_calls" finish reason', () => {
    const chunk = buildDoneChunk('auto', 'id1', 'tool_calls');
    expect(chunk.choices[0].finish_reason).toBe('tool_calls');
  });
});

// ── buildFullChatResponse ────────────────────────────────────────────────────

describe('buildFullChatResponse', () => {
  test('returns correct chat.completion format', () => {
    const resp = buildFullChatResponse('text', 'auto', 'stop', 'id1');
    expect(resp.object).toBe('chat.completion');
    expect(resp.id).toBe('id1');
    expect(resp.model).toBe('auto');
    expect(resp.choices[0].message.role).toBe('assistant');
    expect(resp.choices[0].message.content).toBe('text');
    expect(resp.choices[0].finish_reason).toBe('stop');
    expect(resp.usage).toBeDefined();
    expect(resp.usage.prompt_tokens).toBeNull();
  });
});

// ── buildFullChatResponseWithTools ───────────────────────────────────────────

describe('buildFullChatResponseWithTools', () => {
  test('contains tool_calls in message', () => {
    const toolCalls = [{ id: 'c1', type: 'function' as const, function: { name: 'fn', arguments: '{}' } }];
    const resp = buildFullChatResponseWithTools(toolCalls, null, 'auto', 'tool_calls', 'id1');
    expect(resp.choices[0].message.tool_calls).toEqual(toolCalls);
    expect(resp.choices[0].message.content).toBeNull();
    expect(resp.choices[0].finish_reason).toBe('tool_calls');
  });

  test('includes content when provided', () => {
    const toolCalls = [{ id: 'c1', type: 'function' as const, function: { name: 'fn', arguments: '{}' } }];
    const resp = buildFullChatResponseWithTools(toolCalls, 'some text', 'auto', 'tool_calls', 'id1');
    expect(resp.choices[0].message.content).toBe('some text');
  });
});

// ── buildCompletionStreamChunk ───────────────────────────────────────────────

describe('buildCompletionStreamChunk', () => {
  test('returns text_completion_chunk format', () => {
    const chunk = buildCompletionStreamChunk('text', 'auto', 'id1');
    expect(chunk.object).toBe('text_completion_chunk');
    expect(chunk.choices[0].text).toBe('text');
    expect(chunk.choices[0].finish_reason).toBeNull();
  });
});

// ── buildFullCompletionResponse ──────────────────────────────────────────────

describe('buildFullCompletionResponse', () => {
  test('returns text_completion format', () => {
    const resp = buildFullCompletionResponse('text', 'auto', 'stop', 'id1');
    expect(resp.object).toBe('text_completion');
    expect(resp.choices[0].text).toBe('text');
    expect(resp.choices[0].finish_reason).toBe('stop');
    expect(resp.usage).toBeDefined();
  });
});
