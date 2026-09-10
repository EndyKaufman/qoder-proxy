import request from 'supertest';
import { buildApp } from './setup';
import type { INestApplication } from '@nestjs/common';

describe('POST /v1/chat/completions', () => {
  let app: INestApplication;
  let mocks: { mockRunQoderRequest: jest.Mock; mockCheckQoderCli: jest.Mock };

  beforeAll(async () => {
    const ctx = await buildApp();
    app = ctx.app;
    mocks = ctx.mocks;
  });

  beforeEach(() => {
    mocks.mockRunQoderRequest.mockReset();
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  describe('validation', () => {
    test('returns 400 when messages is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ model: 'auto' });
      expect(res.status).toBe(400);
      expect(res.body.error.type).toBe('invalid_request_error');
    });

    test('returns 400 when messages is empty array', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [] });
      expect(res.status).toBe(400);
    });

    test('returns 400 for GET method', async () => {
      const res = await request(app.getHttpServer()).get('/v1/chat/completions');
      expect(res.status).toBe(400);
      expect(res.body.error.type).toBe('invalid_request_error');
    });
  });

  // ── Non-streaming ──────────────────────────────────────────────────────────

  describe('non-streaming', () => {
    test('returns 200 with chat.completion response', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onChunk, onDone }: { onChunk: (e: any) => void; onDone: (c: number, s: string) => void }) => {
        onChunk({
          type: 'assistant',
          subtype: 'message',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
        });
        setTimeout(() => onDone(0, ''), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: false });

      expect(res.status).toBe(200);
      expect(res.body.object).toBe('chat.completion');
      expect(res.body.choices[0].message.role).toBe('assistant');
      expect(res.body.choices[0].message.content).toContain('Hello!');
    });

    test('uses "auto" model when no model specified', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
        setTimeout(() => onDone(0, ''), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(mocks.mockRunQoderRequest).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'auto' }),
      );
    });

    test('returns 500 when qodercli exits with error', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
        setTimeout(() => onDone(1, 'some error'), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(res.status).toBe(500);
      expect(res.body.error.type).toBe('api_error');
    });
  });

  // ── Streaming ──────────────────────────────────────────────────────────────

  describe('streaming', () => {
    test('returns SSE headers', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
        setTimeout(() => onDone(0, ''), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: true });

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
    });

    test('sends initial chunk with role', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
        setTimeout(() => onDone(0, ''), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: true });

      const lines = res.text.split('\n').filter(l => l.startsWith('data: '));
      expect(lines.length).toBeGreaterThan(0);
      const firstChunk = JSON.parse(lines[0].replace('data: ', ''));
      expect(firstChunk.choices[0].delta.role).toBe('assistant');
    });

    test('ends with [DONE]', async () => {
      mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
        setTimeout(() => onDone(0, ''), 10);
        return { kill: jest.fn(), on: jest.fn() };
      });

      const res = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: true });

      expect(res.text).toContain('[DONE]');
    });
  });
  afterAll(async () => { await app?.close(); });

});
