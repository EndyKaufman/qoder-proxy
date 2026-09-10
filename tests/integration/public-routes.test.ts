import request from 'supertest';
import { buildApp } from './setup';
import type { INestApplication } from '@nestjs/common';

describe('Public routes', () => {
  let app: INestApplication;
  let mocks: { mockRunQoderRequest: jest.Mock; mockCheckQoderCli: jest.Mock };

  beforeAll(async () => {
    const ctx = await buildApp();
    app = ctx.app;
    mocks = ctx.mocks;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /', () => {
    test('returns 200 with server info', async () => {
      const res = await request(app.getHttpServer()).get('/');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Qoder OpenAI Proxy');
      expect(res.body.version).toBeDefined();
      expect(res.body.endpoints).toBeInstanceOf(Array);
      expect(res.body.endpoints).toContain('GET /v1/models');
      expect(res.body.endpoints).toContain('POST /v1/chat/completions');
      expect(res.body.endpoints).toContain('POST /v1/completions');
      expect(res.body.endpoints).toContain('GET /health');
    });
  });

  describe('GET /health', () => {
    test('returns 200 when qodercli is available', async () => {
      mocks.mockCheckQoderCli.mockResolvedValueOnce('available');
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    test('returns 503 when qodercli is unavailable', async () => {
      mocks.mockCheckQoderCli.mockResolvedValueOnce(null);
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
    });

    test('returns 200 when qodercli times out (truthy value)', async () => {
      mocks.mockCheckQoderCli.mockResolvedValueOnce('timeout');
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });
  });
});
