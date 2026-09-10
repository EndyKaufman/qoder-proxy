import { LogStoreService } from '../../../src/log-store/log-store.service';
import { LoggerMiddleware } from '../../../src/common/middleware/logger.middleware';
import { ConfigService } from '@nestjs/config';

const createMockLogStore = () => {
  const store = {
    addRequest: jest.fn(),
    addSystem: jest.fn(),
    getRequests: jest.fn(() => []),
    getSystem: jest.fn(() => []),
    clearRequests: jest.fn(),
    clearSystem: jest.fn(),
  };
  return store as unknown as LogStoreService & { addRequest: jest.Mock; addSystem: jest.Mock };
};

describe('logger middleware', () => {
  let mockLogStore: ReturnType<typeof createMockLogStore>;
  let middleware: LoggerMiddleware;

  beforeEach(() => {
    mockLogStore = createMockLogStore();
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'LOG_MAX_ENTRIES') return 500;
        if (key === 'LOG_BODY_MAX_BYTES') return 8192;
        return undefined;
      }),
    } as unknown as ConfigService<any>;
    // Create the middleware with a real LogStoreService instance
    const realStore = new LogStoreService(mockConfigService);
    // Replace internal methods with our mocks
    (realStore as any).addRequest = mockLogStore.addRequest;
    middleware = new LoggerMiddleware(realStore);
  });

  const createReqRes = (method = 'GET', reqPath = '/v1/test', body: any = null) => {
    const listeners: Record<string, Function> = {};
    const req = {
      method,
      path: reqPath,
      originalUrl: reqPath,
      body,
      headers: {},
    };
    const res: any = {
      statusCode: 200,
      _json: null,
      _writes: [] as any[],
      _listeners: listeners,
      json(body: any) { this._json = body; return this; },
      write(chunk: any) { this._writes.push(chunk); },
      on(event: string, fn: Function) { listeners[event] = fn; },
    };
    return { req: req as any, res: res as any };
  };

  test('logs JSON responses with request and response payloads', () => {
    const { req, res } = createReqRes('POST', '/v1/chat/completions', { messages: [] });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();

    res.json({ result: 'ok' });

    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(mockLogStore.addRequest).toHaveBeenCalledWith(
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
    middleware.use(req, res, next);

    res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
    res.write('data: [DONE]\n\n');

    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(mockLogStore.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        isStream: true,
        streamChunks: 1,
      }),
    );
  });

  test('does not log non-v1/api paths', () => {
    const { req, res } = createReqRes('GET', '/favicon.ico');
    const next = jest.fn();
    middleware.use(req, res, next);

    res.json({ ok: true });
    res.statusCode = 200;
    if (res._listeners.finish) res._listeners.finish();

    expect(mockLogStore.addRequest).not.toHaveBeenCalled();
  });

  test('captures error for status >= 400', () => {
    const { req, res } = createReqRes('POST', '/v1/chat/completions', {});
    const next = jest.fn();
    middleware.use(req, res, next);

    res.statusCode = 400;
    res.json({ error: { message: 'Bad request' } });

    if (res._listeners.finish) res._listeners.finish();

    expect(mockLogStore.addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: { message: 'Bad request' },
      }),
    );
  });
});
