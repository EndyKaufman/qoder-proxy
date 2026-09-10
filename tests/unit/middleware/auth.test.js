// Auth middleware tests — must use jest.isolateModules to reload config per test

const createMockReqRes = (headers = {}) => {
  const req = { headers: { ...headers } };
  const res = {
    statusCode: 200,
    _json: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this._json = body; return this; },
  };
  return { req, res };
};

describe('auth middleware', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.PROXY_API_KEY;
  });

  test('calls next() when API_KEY is not set (open access)', () => {
    process.env.PROXY_API_KEY = '';
    jest.resetModules();
    const authMiddleware = require('../../../src/middleware/auth');
    const { req, res } = createMockReqRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 when API_KEY is set but no Authorization header', () => {
    process.env.PROXY_API_KEY = 'test-key-123';
    jest.resetModules();
    const authMiddleware = require('../../../src/middleware/auth');
    const { req, res } = createMockReqRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json.error.code).toBe('invalid_api_key');
  });

  test('returns 401 when Authorization header has no Bearer prefix', () => {
    process.env.PROXY_API_KEY = 'test-key-123';
    jest.resetModules();
    const authMiddleware = require('../../../src/middleware/auth');
    const { req, res } = createMockReqRes({ authorization: 'Basic abc123' });
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test('returns 401 when token does not match API_KEY', () => {
    process.env.PROXY_API_KEY = 'test-key-123';
    jest.resetModules();
    const authMiddleware = require('../../../src/middleware/auth');
    const { req, res } = createMockReqRes({ authorization: 'Bearer wrong-key' });
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test('calls next() when token matches API_KEY', () => {
    process.env.PROXY_API_KEY = 'test-key-123';
    jest.resetModules();
    const authMiddleware = require('../../../src/middleware/auth');
    const { req, res } = createMockReqRes({ authorization: 'Bearer test-key-123' });
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
