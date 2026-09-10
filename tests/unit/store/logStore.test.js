const {
  addRequest,
  addSystem,
  getRequests,
  getSystem,
  clearRequests,
  clearSystem,
} = require('../../../src/store/logStore');

beforeEach(() => {
  clearRequests();
  clearSystem();
});

// ── addRequest / getRequests ─────────────────────────────────────────────────

describe('addRequest / getRequests', () => {
  test('adds a request entry with id and timestamp', () => {
    addRequest({ method: 'GET', path: '/test', statusCode: 200, durationMs: 10 });
    const logs = getRequests();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
    expect(logs[0].method).toBe('GET');
    expect(logs[0].path).toBe('/test');
  });

  test('returns entries in reverse order (newest first)', () => {
    addRequest({ method: 'GET', path: '/first' });
    addRequest({ method: 'POST', path: '/second' });
    addRequest({ method: 'PUT', path: '/third' });
    const logs = getRequests();
    expect(logs).toHaveLength(3);
    expect(logs[0].path).toBe('/third');
    expect(logs[1].path).toBe('/second');
    expect(logs[2].path).toBe('/first');
  });
});

// ── addSystem / getSystem ────────────────────────────────────────────────────

describe('addSystem / getSystem', () => {
  test('adds a system entry with message, level, and source', () => {
    addSystem('test message', 'info', 'test');
    const logs = getSystem();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('test message');
    expect(logs[0].level).toBe('info');
    expect(logs[0].source).toBe('test');
    expect(logs[0].id).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
  });

  test('returns entries in reverse order', () => {
    addSystem('first', 'info', 'test');
    addSystem('second', 'warn', 'test');
    const logs = getSystem();
    expect(logs[0].message).toBe('second');
    expect(logs[1].message).toBe('first');
  });

  test('defaults level to info and source to server', () => {
    addSystem('msg');
    const logs = getSystem();
    expect(logs[0].level).toBe('info');
    expect(logs[0].source).toBe('server');
  });
});

// ── clearRequests / clearSystem ──────────────────────────────────────────────

describe('clearRequests / clearSystem', () => {
  test('clearRequests empties request log', () => {
    addRequest({ method: 'GET', path: '/test' });
    expect(getRequests()).toHaveLength(1);
    clearRequests();
    expect(getRequests()).toHaveLength(0);
  });

  test('clearSystem empties system log', () => {
    addSystem('msg');
    expect(getSystem()).toHaveLength(1);
    clearSystem();
    expect(getSystem()).toHaveLength(0);
  });
});

// ── truncation ───────────────────────────────────────────────────────────────

describe('truncation', () => {
  test('truncates long requestPayload', () => {
    const longPayload = 'x'.repeat(20000);
    addRequest({ method: 'POST', path: '/test', requestPayload: longPayload });
    const logs = getRequests();
    expect(logs[0].requestPayload).toContain('…[truncated]');
    expect(logs[0].requestPayload.length).toBeLessThan(longPayload.length + 20);
  });

  test('does not truncate short requestPayload', () => {
    addRequest({ method: 'POST', path: '/test', requestPayload: 'short' });
    const logs = getRequests();
    expect(logs[0].requestPayload).toBe('short');
  });

  test('preserves null requestPayload', () => {
    addRequest({ method: 'POST', path: '/test', requestPayload: null });
    const logs = getRequests();
    expect(logs[0].requestPayload).toBeNull();
  });

  test('truncates long responsePayload', () => {
    const longResponse = 'y'.repeat(20000);
    addRequest({ method: 'GET', path: '/test', responsePayload: longResponse });
    const logs = getRequests();
    expect(logs[0].responsePayload).toContain('…[truncated]');
  });
});

// ── LOG_MAX_ENTRIES limit ────────────────────────────────────────────────────

describe('LOG_MAX_ENTRIES limit', () => {
  test('evicts oldest entries when limit exceeded', () => {
    // Default LOG_MAX_ENTRIES is 500
    for (let i = 0; i < 510; i++) {
      addRequest({ method: 'GET', path: `/test/${i}` });
    }
    const logs = getRequests();
    expect(logs.length).toBeLessThanOrEqual(500);
    // Newest should be present
    expect(logs[0].path).toBe('/test/509');
  });
});
