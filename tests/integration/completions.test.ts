import request from 'supertest';
import { buildApp } from './setup';

describe('POST /v1/completions', () => {
  let app: ReturnType<typeof buildApp>['app'];
  let mocks: ReturnType<typeof buildApp>['mocks'];

  beforeAll(() => {
    const ctx = buildApp();
    app = ctx.app;
    mocks = ctx.mocks;
  });

  beforeEach(() => {
    mocks.mockRunQoderRequest.mockReset();
  });

  test('returns 400 when prompt is missing', async () => {
    const res = await request(app).post('/v1/completions').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('prompt is required');
  });

  test('returns 200 with text_completion response (non-streaming)', async () => {
    mocks.mockRunQoderRequest.mockImplementation(({ onChunk, onDone }: { onChunk: (e: any) => void; onDone: (c: number, s: string) => void }) => {
      onChunk({
        type: 'assistant',
        subtype: 'message',
        message: { content: 'Completion text' },
      });
      setTimeout(() => onDone(0, ''), 10);
      return { kill: jest.fn(), on: jest.fn() };
    });

    const res = await request(app)
      .post('/v1/completions')
      .send({ prompt: 'Once upon a time', stream: false });

    expect(res.status).toBe(200);
    expect(res.body.object).toBe('text_completion');
    expect(res.body.choices[0].text).toContain('Completion text');
  });

  test('returns SSE for streaming', async () => {
    mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
      setTimeout(() => onDone(0, ''), 10);
      return { kill: jest.fn(), on: jest.fn() };
    });

    const res = await request(app)
      .post('/v1/completions')
      .send({ prompt: 'Hello', stream: true });

    expect(res.headers['content-type']).toContain('text/event-stream');
    const lines = res.text.split('\n').filter(l => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThan(0);
    const firstChunk = JSON.parse(lines[0].replace('data: ', ''));
    expect(firstChunk.choices[0].text).toBe('');
  });

  test('returns 500 when qodercli exits with error', async () => {
    mocks.mockRunQoderRequest.mockImplementation(({ onDone }: { onDone: (c: number, s: string) => void }) => {
      setTimeout(() => onDone(1, 'error output'), 10);
      return { kill: jest.fn(), on: jest.fn() };
    });

    const res = await request(app)
      .post('/v1/completions')
      .send({ prompt: 'Hello' });

    expect(res.status).toBe(500);
    expect(res.body.error.type).toBe('api_error');
  });
});
