import { ConfigService } from '@nestjs/config';
import { QoderCliService } from '../../../src/qoder-cli/qoder-cli.service';
import { LogStoreService } from '../../../src/log-store/log-store.service';

// Create a QoderCliService instance to test private methods
const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'QODER_PAT') return null;
    if (key === 'QODER_TIMEOUT_MS') return 120000;
    if (key === 'QODER_MAX_OUTPUT_TOKENS') return '16k';
    return undefined;
  }),
} as unknown as ConfigService<any>;

const mockLogStoreService = {
  addSystem: jest.fn(),
} as unknown as LogStoreService;

const service = new QoderCliService(mockConfigService, mockLogStoreService);

// Access private methods for testing
const extractEventText = (service as any).extractEventText.bind(service);
const hasVisibleAssistantText = (service as any).hasVisibleAssistantText.bind(service);
const deepFindText = (service as any).deepFindText.bind(service);

// ── extractEventText ─────────────────────────────────────────────────────────

describe('extractEventText', () => {
  test('extracts string content from message', () => {
    const data = { message: { content: 'hello world' } };
    expect(extractEventText(data)).toBe('hello world');
  });

  test('extracts from array content', () => {
    const data = {
      message: {
        content: [
          { type: 'text', text: 'part1' },
          { type: 'text', text: 'part2' },
        ],
      },
    };
    expect(extractEventText(data)).toBe('part1part2');
  });

  test('extracts from data.result string', () => {
    const data = { result: 'result text' };
    expect(extractEventText(data)).toBe('result text');
  });

  test('extracts from data.result.text', () => {
    const data = { result: { text: 'nested result' } };
    expect(extractEventText(data)).toBe('nested result');
  });

  test('extracts from data.result.value', () => {
    const data = { result: { value: 'value result' } };
    expect(extractEventText(data)).toBe('value result');
  });

  test('returns empty string for null data', () => {
    expect(extractEventText(null)).toBe('');
  });

  test('returns empty string for undefined data', () => {
    expect(extractEventText(undefined)).toBe('');
  });

  test('returns empty string for non-object data', () => {
    expect(extractEventText('string')).toBe('');
  });

  test('handles content with value fields', () => {
    const data = {
      message: {
        content: [{ text: { value: 'deep value' } }],
      },
    };
    expect(extractEventText(data)).toBe('deep value');
  });

  test('falls back to deepFindText for unknown schemas', () => {
    const data = { unknown: { text: 'found deep' } };
    expect(extractEventText(data)).toBe('found deep');
  });
});

// ── hasVisibleAssistantText ──────────────────────────────────────────────────

describe('hasVisibleAssistantText', () => {
  test('returns true for string content with text', () => {
    const data = { message: { content: 'visible text' } };
    expect(hasVisibleAssistantText(data)).toBe(true);
  });

  test('returns false for empty string content', () => {
    const data = { message: { content: '' } };
    expect(hasVisibleAssistantText(data)).toBe(false);
  });

  test('returns false for whitespace-only content', () => {
    const data = { message: { content: '   ' } };
    expect(hasVisibleAssistantText(data)).toBe(false);
  });

  test('returns true for array content with text', () => {
    const data = { message: { content: [{ type: 'text', text: 'hello' }] } };
    expect(hasVisibleAssistantText(data)).toBe(true);
  });

  test('returns false for array content with empty text', () => {
    const data = { message: { content: [{ type: 'text', text: '' }] } };
    expect(hasVisibleAssistantText(data)).toBe(false);
  });

  test('returns false for null data', () => {
    expect(hasVisibleAssistantText(null)).toBe(false);
  });

  test('returns false for data without message', () => {
    expect(hasVisibleAssistantText({})).toBe(false);
  });

  test('returns true for parts with value field', () => {
    const data = { message: { content: [{ value: 'val' }] } };
    expect(hasVisibleAssistantText(data)).toBe(true);
  });
});

// ── deepFindText ─────────────────────────────────────────────────────────────

describe('deepFindText', () => {
  test('finds text in nested object', () => {
    const obj = { a: { b: { text: 'found it' } } };
    expect(deepFindText(obj)).toBe('found it');
  });

  test('finds text at top level', () => {
    const obj = { text: 'top level' };
    expect(deepFindText(obj)).toBe('top level');
  });

  test('finds value field', () => {
    const obj = { data: { value: 'the value' } };
    expect(deepFindText(obj)).toBe('the value');
  });

  test('finds result field', () => {
    const obj = { output: { result: 'the result' } };
    expect(deepFindText(obj)).toBe('the result');
  });

  test('finds content field', () => {
    const obj = { wrapper: { content: 'the content' } };
    expect(deepFindText(obj)).toBe('the content');
  });

  test('finds text in array items', () => {
    const obj = { items: [{ text: 'in array' }] };
    expect(deepFindText(obj)).toBe('in array');
  });

  test('returns empty string for deeply nested beyond limit', () => {
    const obj = { a: { b: { c: { d: { e: { f: { g: { text: 'too deep' } } } } } } } };
    expect(deepFindText(obj)).toBe('');
  });

  test('returns empty string for null', () => {
    expect(deepFindText(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(deepFindText(undefined)).toBe('');
  });

  test('returns trimmed string for string input', () => {
    expect(deepFindText('  hello  ')).toBe('hello');
  });

  test('prioritizes text key over others', () => {
    const obj = { text: 'first', value: 'second' };
    expect(deepFindText(obj)).toBe('first');
  });
});
