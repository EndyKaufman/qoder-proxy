import request from 'supertest';

describe('Auth middleware (integration)', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.PROXY_API_KEY;
  });

  const createAppWithKey = (apiKey: string | null) => {
    if (apiKey) {
      process.env.PROXY_API_KEY = apiKey;
    }
    jest.resetModules();
    jest.mock('../../src/helpers/spawn', () => ({
      runQoderRequest: jest.fn(),
      checkQoderCli: jest.fn().mockResolvedValue('available'),
      extractEventText: jest.fn(),
      hasVisibleAssistantText: jest.fn(),
      deepFindText: jest.fn(),
    }));
    const { app } = require('../../src/server') as { app: ReturnType<typeof request> extends infer R ? R extends request.Agent ? any : never : never };
    return app;
  };

  test('requests pass without API_KEY configured', async () => {
    const app = createAppWithKey(null);
    const res = await request(app).get('/v1/models');
    expect(res.status).not.toBe(401);
  });

  test('requests without Bearer token return 401 when API_KEY is set', async () => {
    const app = createAppWithKey('test-secret-key');
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_api_key');
  });

  test('requests with wrong token return 401', async () => {
    const app = createAppWithKey('test-secret-key');
    const res = await request(app)
      .get('/v1/models')
      .set('Authorization', 'Bearer wrong-key');
    expect(res.status).toBe(401);
  });

  test('requests with correct token pass through', async () => {
    const app = createAppWithKey('test-secret-key');
    const res = await request(app)
      .get('/v1/models')
      .set('Authorization', 'Bearer test-secret-key');
    expect(res.status).not.toBe(401);
  });
});
