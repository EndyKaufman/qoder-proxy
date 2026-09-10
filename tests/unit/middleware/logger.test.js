jest.mock('../../../src/store/logStore', () => ({
  addRequest: jest.fn(),
  addSystem: jest.fn(),
  getRequests: jest.fn(() => []),
  getSystem: jest.fn(() => []),
  clearRequests: jest.fn(),
  clearSystem: jest.fn(),
}));

const { addRequest } = require('../../../src/store/logStore');
const logger = require('../../../src/middleware/logger');

describe('logger middleware', () => {
  beforeEach(() => {
    addRequest.mockClear();
  });

  const createReqRes = (method = 'GET', path = '/v1/test', body = null) => {
    const listeners = {};
    const req = {
      method,
      path,
      originalUrl: path,
      body,
      headers: {},
    };
    const res = {
      statusCode: 200,
      _json: null,
      _writes: [],
      _listeners: listeners,
      json(body) { this._json = body; return this; },
      write(chunk) { this._writes.push(chunk); },
      on(event, fn) { listeners[event] = fn; },
    };
    return { req, res };
  };

  test('logs JSON responses with request and response payloads', () => {
    const { req, res } = createReqRes('POST', '/v1/chat/completions', { messages: [] });
    const next = jest.fn();
    logger(req, res, next);
    expect(next).toHaveBeenCalled();

    // Simulate JSON response
    res.json({ result: 'ok' });

    // Simulate response finish
    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/chat/completions',
        statusCode: 200,
        requestPayload: { messages: [] },
        responsePayload: { result: 'ok' },
      }),
    );
  });

  test('logs SSE streams with isStream flag', () => {
    const { req, res } = createReqRes('POST', '/v1/chat/completions', { messages: [], stream: true });
    const next = jest.fn();
    logger(req, res, next);

    // Simulate SSE writes
    res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
    res.write('data: [DONE]\n\n');

    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        isStream: true,
        streamChunks: 1,
      }),
    );
  });

  test('does not log non-v1/api paths', () => {
    const { req, res } = createReqRes('GET', '/favicon.ico');
    const next = jest.fn();
    logger(req, res, next);

    res.json({ ok: true });
    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(addRequest).not.toHaveBeenCalled();
  });

  test('captures error for status >= 400', () => {
    const { req, res } = createReqRes('POST', '/v1/chat/completions', {});
    const next = jest.fn();
    logger(req, res, next);

    res.statusCode = 400;
    res.json({ error: { message: 'Bad request' } });

    if (res._listeners.finish) res._listeners.finish();

    expect(addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: { message: 'Bad request' },
      }),
    );
  });
});
