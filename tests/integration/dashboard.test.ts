import request from 'supertest';
import { buildApp } from './setup';
import type { INestApplication } from '@nestjs/common';
import { createToken } from '../../src/common/guards/dashboard-auth.guard';

describe('Dashboard', () => {
  let app: INestApplication;
  let mocks: { mockRunQoderRequest: jest.Mock; mockCheckQoderCli: jest.Mock };

  beforeAll(async () => {
    const ctx = await buildApp({
      DASHBOARD_ENABLED: 'true',
      DASHBOARD_PASSWORD: 'test-password',
      DASHBOARD_SECRET: 'test-secret-for-dashboard-tests',
    });
    app = ctx.app;
    mocks = ctx.mocks;
  });

  beforeEach(() => {
    mocks.mockRunQoderRequest.mockReset();
  });

  // ── Login / Logout ─────────────────────────────────────────────────────────

  describe('POST /dashboard/login', () => {
    test('redirects to /dashboard/ with valid password', async () => {
      const res = await request(app.getHttpServer())
        .post('/dashboard/login')
        .type('form')
        .send({ password: 'test-password' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard/');
      expect(res.headers['set-cookie']).toBeDefined();
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('qoder_dash=');
    });

    test('redirects to /dashboard/login?error=1 with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/dashboard/login')
        .type('form')
        .send({ password: 'wrong' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard/login?error=1');
    });
  });

  describe('GET /dashboard/logout', () => {
    test('redirects to /dashboard/login and clears cookie', async () => {
      const res = await request(app.getHttpServer()).get('/dashboard/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/dashboard/login');
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('Max-Age=0');
    });
  });

  // ── Protected API ──────────────────────────────────────────────────────────

  describe('Protected API without auth', () => {
    test('returns 401 for /dashboard/api/config without cookie', async () => {
      const res = await request(app.getHttpServer()).get('/dashboard/api/config');
      expect(res.status).toBe(401);
    });

    test('returns 401 for /dashboard/api/status without cookie', async () => {
      const res = await request(app.getHttpServer()).get('/dashboard/api/status');
      expect(res.status).toBe(401);
    });
  });

  describe('Protected API with valid auth', () => {
    let validCookie: string;

    beforeAll(async () => {
      validCookie = createToken('test-secret-for-dashboard-tests');
    });

    test('GET /dashboard/api/config returns config', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/api/config')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.version).toBeDefined();
      expect(typeof res.body.authEnabled).toBe('boolean');
    });

    test('GET /dashboard/api/status returns status', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/api/status')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.uptime).toBeDefined();
      expect(res.body.memoryMB).toBeDefined();
      expect(res.body.version).toBeDefined();
    });

    test('GET /dashboard/api/models returns models', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/api/models')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.models).toBeInstanceOf(Array);
      expect(res.body.models.length).toBeGreaterThan(0);
    });

    test('GET /dashboard/api/logs returns logs array', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/api/logs')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeInstanceOf(Array);
    });

    test('DELETE /dashboard/api/logs clears logs', async () => {
      const res = await request(app.getHttpServer())
        .delete('/dashboard/api/logs')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('GET /dashboard/api/logs/system returns system logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/api/logs/system')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeInstanceOf(Array);
    });

    test('DELETE /dashboard/api/logs/system clears system logs', async () => {
      const res = await request(app.getHttpServer())
        .delete('/dashboard/api/logs/system')
        .set('Cookie', `qoder_dash=${validCookie}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
  afterAll(async () => { await app?.close(); });

});
