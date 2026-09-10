import request from 'supertest';
import { buildApp } from './setup';

describe('Misc endpoints', () => {
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    const ctx = buildApp();
    app = ctx.app;
  });

  describe('POST /v1/embeddings', () => {
    test('returns 501 Not Implemented', async () => {
      const res = await request(app)
        .post('/v1/embeddings')
        .send({ input: 'test', model: 'text-embedding-ada-002' });
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('endpoint_not_supported');
      expect(res.body.error.type).toBe('not_implemented_error');
    });
  });

  describe('Unknown /v1/* routes', () => {
    test('returns 404 for unknown endpoint', async () => {
      const res = await request(app).get('/v1/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('endpoint_not_found');
      expect(res.body.error.message).toContain('Unknown endpoint');
    });

    test('returns 404 for /v1/images/generations', async () => {
      const res = await request(app).post('/v1/images/generations').send({});
      expect(res.status).toBe(404);
    });
  });
});
