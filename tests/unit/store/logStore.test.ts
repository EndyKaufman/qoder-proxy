import { LogStoreService } from '../../../src/log-store/log-store.service';
import { ConfigService } from '@nestjs/config';

const createMockConfigService = (maxEntries = 500, maxBytes = 8192) => ({
  get: jest.fn((key: string) => {
    if (key === 'LOG_MAX_ENTRIES') return maxEntries;
    if (key === 'LOG_BODY_MAX_BYTES') return maxBytes;
    return undefined;
  }),
} as unknown as ConfigService<any>);

let service: LogStoreService;

beforeEach(() => {
  service = new LogStoreService(createMockConfigService());
  service.clearRequests();
  service.clearSystem();
});

// ── addRequest / getRequests ─────────────────────────────────────────────────

describe('addRequest / getRequests', () => {
  test('adds a request entry with id and timestamp', () => {
    service.addRequest({ method: 'GET', path: '/test', statusCode: 200, durationMs: 10 });
    const logs = service.getRequests();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
    expect(logs[0].method).toBe('GET');
    expect(logs[0].path).toBe('/test');
  });

  test('returns entries in reverse order (newest first)', () => {
    service.addRequest({ method: 'GET', path: '/first' });
    service.addRequest({ method: 'POST', path: '/second' });
    service.addRequest({ method: 'PUT', path: '/third' });
    const logs = service.getRequests();
    expect(logs).toHaveLength(3);
    expect(logs[0].path).toBe('/third');
    expect(logs[1].path).toBe('/second');
    expect(logs[2].path).toBe('/first');
  });
});

// ── addSystem / getSystem ────────────────────────────────────────────────────

describe('addSystem / getSystem', () => {
  test('adds a system entry with message, level, and source', () => {
    service.addSystem('test message', 'info', 'test');
    const logs = service.getSystem();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('test message');
    expect(logs[0].level).toBe('info');
    expect(logs[0].source).toBe('test');
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
  });

  test('returns entries in reverse order', () => {
    service.addSystem('first', 'info', 'test');
    service.addSystem('second', 'warn', 'test');
    const logs = service.getSystem();
    expect(logs[0].message).toBe('second');
    expect(logs[1].message).toBe('first');
  });

  test('defaults level to info and source to server', () => {
    service.addSystem('msg');
    const logs = service.getSystem();
    expect(logs[0].level).toBe('info');
    expect(logs[0].source).toBe('server');
  });
});

// ── clearRequests / clearSystem ──────────────────────────────────────────────

describe('clearRequests / clearSystem', () => {
  test('clearRequests empties request log', () => {
    service.addRequest({ method: 'GET', path: '/test' });
    expect(service.getRequests()).toHaveLength(1);
    service.clearRequests();
    expect(service.getRequests()).toHaveLength(0);
  });

  test('clearSystem empties system log', () => {
    service.addSystem('msg');
    expect(service.getSystem()).toHaveLength(1);
    service.clearSystem();
    expect(service.getSystem()).toHaveLength(0);
  });
});

// ── truncation ───────────────────────────────────────────────────────────────

describe('truncation', () => {
  test('truncates long requestPayload', () => {
    const longPayload = 'x'.repeat(20000);
    service.addRequest({ method: 'POST', path: '/test', requestPayload: longPayload });
    const logs = service.getRequests();
    expect(logs[0].requestPayload).toContain('…[truncated]');
    expect((logs[0].requestPayload as string).length).toBeLessThan(longPayload.length + 20);
  });

  test('does not truncate short requestPayload', () => {
    service.addRequest({ method: 'POST', path: '/test', requestPayload: 'short' });
    const logs = service.getRequests();
    expect(logs[0].requestPayload).toBe('short');
  });

  test('preserves null requestPayload', () => {
    service.addRequest({ method: 'POST', path: '/test', requestPayload: null });
    const logs = service.getRequests();
    expect(logs[0].requestPayload).toBeNull();
  });

  test('truncates long responsePayload', () => {
    const longResponse = 'y'.repeat(20000);
    service.addRequest({ method: 'GET', path: '/test', responsePayload: longResponse });
    const logs = service.getRequests();
    expect(logs[0].responsePayload).toContain('…[truncated]');
  });
});

// ── LOG_MAX_ENTRIES limit ────────────────────────────────────────────────────

describe('LOG_MAX_ENTRIES limit', () => {
  test('evicts oldest entries when limit exceeded', () => {
    for (let i = 0; i < 510; i++) {
      service.addRequest({ method: 'GET', path: `/test/${i}` });
    }
    const logs = service.getRequests();
    expect(logs.length).toBeLessThanOrEqual(500);
    expect(logs[0].path).toBe('/test/509');
  });
});
