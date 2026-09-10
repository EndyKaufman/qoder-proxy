import request from 'supertest';
import { buildApp } from './setup';

describe('GET /v1/models', () => {
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    const ctx = buildApp();
    app = ctx.app;
  });

  test('returns object: list', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(res.body.data).toBeInstanceOf(Array);
  });

  test('contains native qoder models', async () => {
    const res = await request(app).get('/v1/models');
    const nativeIds = ['auto', 'ultimate', 'performance', 'qmodel', 'kmodel', 'dmodel', 'dfmodel', 'gm51model', 'mmodel'];
    for (const id of nativeIds) {
      const model = res.body.data.find((m: any) => m.id === id);
      expect(model).toBeDefined();
      expect(model.object).toBe('model');
      expect(model.qoder.is_alias).toBe(false);
    }
  });

  test('contains OpenAI alias models', async () => {
    const res = await request(app).get('/v1/models');
    const aliasIds = ['gpt-4', 'gpt-4o', 'claude-3.5-sonnet', 'claude-3-opus', 'gemini-pro'];
    for (const id of aliasIds) {
      const model = res.body.data.find((m: any) => m.id === id);
      expect(model).toBeDefined();
      expect(model.qoder.is_alias).toBe(true);
      expect(model.qoder.tier).toBe('alias');
    }
  });

  test('native models have qoder metadata', async () => {
    const res = await request(app).get('/v1/models');
    const auto = res.body.data.find((m: any) => m.id === 'auto');
    expect(auto.qoder).toBeDefined();
    expect(auto.qoder.label).toBeDefined();
    expect(auto.qoder.tier).toBeDefined();
    expect(auto.qoder.description).toBeDefined();
  });
});
