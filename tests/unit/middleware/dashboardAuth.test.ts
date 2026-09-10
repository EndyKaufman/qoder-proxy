import { createToken, setCookie, clearCookie, DashboardAuthGuard } from '../../../src/common/guards/dashboard-auth.guard';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';

// Use a fixed secret for tests
const TEST_SECRET = 'test-secret-for-unit-tests';

// ── createToken ──────────────────────────────────────────────────────────────

describe('createToken', () => {
  test('createToken generates a valid token string', () => {
    const token = createToken(TEST_SECRET);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  test('two tokens are different', () => {
    const t1 = createToken(TEST_SECRET);
    const t2 = createToken(TEST_SECRET);
    expect(t1).not.toBe(t2);
  });
});

// ── setCookie / clearCookie ──────────────────────────────────────────────────

describe('setCookie / clearCookie', () => {
  test('setCookie sets qoder_dash cookie with correct attributes', () => {
    const headers: Record<string, string> = {};
    const setHeader = (k: string, v: string) => { headers[k] = v; };
    setCookie(setHeader, 'my-token');
    const cookie = headers['Set-Cookie'];
    expect(cookie).toContain('qoder_dash=my-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=');
    expect(cookie).toContain('Path=/');
  });

  test('clearCookie sets Max-Age=0', () => {
    const headers: Record<string, string> = {};
    const setHeader = (k: string, v: string) => { headers[k] = v; };
    clearCookie(setHeader);
    const cookie = headers['Set-Cookie'];
    expect(cookie).toContain('qoder_dash=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});

// ── DashboardAuthGuard ───────────────────────────────────────────────────────

describe('DashboardAuthGuard', () => {
  const createGuard = () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'DASHBOARD_SECRET' ? TEST_SECRET : undefined),
    } as unknown as ConfigService<any>;
    return new DashboardAuthGuard(mockConfigService);
  };

  const createContext = (cookie: string | null, path: string) => {
    const req = {
      headers: { cookie: cookie || '' },
      path,
    };
    const res = {
      statusCode: 200,
      _redirect: null as string | null,
      _json: null as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: any) { this._json = body; return this; },
      redirect(url: string) { this._redirect = url; },
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

  test('allows access when valid cookie is present', () => {
    const guard = createGuard();
    const token = createToken(TEST_SECRET);
    const { context } = createContext(`qoder_dash=${token}`, '/dashboard/api/config');
    expect(guard.canActivate(context)).toBe(true);
  });

  test('redirects to /dashboard/login for non-API paths without cookie', () => {
    const guard = createGuard();
    const { context, res } = createContext(null, '/');
    expect(guard.canActivate(context)).toBe(false);
    expect(res._redirect).toBe('/dashboard/login');
  });

  test('returns 401 for /dashboard/api/ paths without cookie', () => {
    const guard = createGuard();
    const { context, res } = createContext(null, '/dashboard/api/config');
    expect(guard.canActivate(context)).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Not authenticated');
  });

  test('redirects for non-API paths with invalid cookie', () => {
    const guard = createGuard();
    const { context, res } = createContext('qoder_dash=invalid', '/');
    expect(guard.canActivate(context)).toBe(false);
    expect(res._redirect).toBe('/dashboard/login');
  });

  test('returns 401 for API paths with invalid cookie', () => {
    const guard = createGuard();
    const { context, res } = createContext('qoder_dash=invalid', '/dashboard/api/status');
    expect(guard.canActivate(context)).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
