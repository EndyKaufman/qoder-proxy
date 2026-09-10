import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { QoderCliService } from '../../src/qoder-cli/qoder-cli.service';

describe('Auth middleware (integration)', () => {
  afterEach(() => {
    delete process.env.PROXY_API_KEY;
  });

  const createAppWithKey = async (apiKey: string | null): Promise<INestApplication> => {
    if (apiKey) {
      process.env.PROXY_API_KEY = apiKey;
    }

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(QoderCliService)
      .useValue({
        runQoderRequest: jest.fn(),
        checkQoderCli: jest.fn().mockResolvedValue('available'),
      })
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();
    return app;
  };

  test('requests pass without API_KEY configured', async () => {
    const app = await createAppWithKey(null);
    const res = await request(app.getHttpServer()).get('/v1/models');
    expect(res.status).not.toBe(401);
    await app.close();
  });

  test('requests without Bearer token return 401 when API_KEY is set', async () => {
    const app = await createAppWithKey('test-secret-key');
    const res = await request(app.getHttpServer()).get('/v1/models');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_api_key');
    await app.close();
  });

  test('requests with wrong token return 401', async () => {
    const app = await createAppWithKey('test-secret-key');
    const res = await request(app.getHttpServer())
      .get('/v1/models')
      .set('Authorization', 'Bearer wrong-key');
    expect(res.status).toBe(401);
    await app.close();
  });

  test('requests with correct token pass through', async () => {
    const app = await createAppWithKey('test-secret-key');
    const res = await request(app.getHttpServer())
      .get('/v1/models')
      .set('Authorization', 'Bearer test-secret-key');
    expect(res.status).not.toBe(401);
    await app.close();
  });
});
