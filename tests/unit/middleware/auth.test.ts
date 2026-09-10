import { ApiKeyGuard } from '../../../src/common/guards/api-key.guard';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const createMockContext = (headers: Record<string, string> = {}) => {
  const req = { headers: { ...headers } };
  const res = {
    statusCode: 200,
    _json: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this._json = body; return this; },
  };
  return {
    req,
    res,
    context: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext,
  };
};

describe('ApiKeyGuard', () => {
  afterEach(() => {
    delete process.env.PROXY_API_KEY;
  });

  test('allows access when API_KEY is not set (open access)', () => {
    process.env.PROXY_API_KEY = '';
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'API_KEY' ? null : undefined),
    } as unknown as ConfigService<any>;
    const guard = new ApiKeyGuard(mockConfigService);
    const { context } = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  test('returns false when API_KEY is set but no Authorization header', () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'API_KEY' ? 'test-key-123' : undefined),
    } as unknown as ConfigService<any>;
    const guard = new ApiKeyGuard(mockConfigService);
    const { context, res } = createMockContext();
    expect(guard.canActivate(context)).toBe(false);
    expect((res as any).statusCode).toBe(401);
  });

  test('returns false when Authorization header has no Bearer prefix', () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'API_KEY' ? 'test-key-123' : undefined),
    } as unknown as ConfigService<any>;
    const guard = new ApiKeyGuard(mockConfigService);
    const { context, res } = createMockContext({ authorization: 'Basic abc123' });
    expect(guard.canActivate(context)).toBe(false);
    expect((res as any).statusCode).toBe(401);
  });

  test('returns false when token does not match API_KEY', () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'API_KEY' ? 'test-key-123' : undefined),
    } as unknown as ConfigService<any>;
    const guard = new ApiKeyGuard(mockConfigService);
    const { context, res } = createMockContext({ authorization: 'Bearer wrong-key' });
    expect(guard.canActivate(context)).toBe(false);
    expect((res as any).statusCode).toBe(401);
  });

  test('allows access when token matches API_KEY', () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'API_KEY' ? 'test-key-123' : undefined),
    } as unknown as ConfigService<any>;
    const guard = new ApiKeyGuard(mockConfigService);
    const { context } = createMockContext({ authorization: 'Bearer test-key-123' });
    expect(guard.canActivate(context)).toBe(true);
  });
});
