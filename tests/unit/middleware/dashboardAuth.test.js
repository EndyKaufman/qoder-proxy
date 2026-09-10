const {
  createToken,
  verifyToken,
  setCookie,
  clearCookie,
  dashboardAuth,
  getToken,
} = require('../../../src/middleware/dashboardAuth');

// ── createToken / verifyToken ────────────────────────────────────────────────

describe('createToken / verifyToken', () => {
  test('createToken generates a token that verifyToken accepts', () => {
    const token = createToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(verifyToken(token)).toBe(true);
  });

  test('verifyToken rejects a fake token', () => {
    expect(verifyToken('fake.token.here')).toBe(false);
  });

  test('verifyToken rejects empty string', () => {
    expect(verifyToken('')).toBe(false);
  });

  test('verifyToken rejects tampered token', () => {
    expect(verifyToken('dGFtcGVyZWQucGF5bG9hZC5mYWtlc2ln')).toBe(false);
  });

  test('two tokens are different', () => {
    const t1 = createToken();
    const t2 = createToken();
    expect(t1).not.toBe(t2);
  });
});

// ── setCookie / clearCookie ──────────────────────────────────────────────────

describe('setCookie / clearCookie', () => {
  test('setCookie sets qoder_dash cookie with correct attributes', () => {
    const res = { _headers: {} };
    res.setHeader = function(k, v) { this._headers[k] = v; };
    setCookie(res, 'my-token');
    const cookie = res._headers['Set-Cookie'];
    expect(cookie).toContain('qoder_dash=my-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=');
    expect(cookie).toContain('Path=/');
  });

  test('clearCookie sets Max-Age=0', () => {
    const res = { _headers: {} };
    res.setHeader = function(k, v) { this._headers[k] = v; };
    clearCookie(res);
    const cookie = res._headers['Set-Cookie'];
    expect(cookie).toContain('qoder_dash=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});

// ── getToken ─────────────────────────────────────────────────────────────────

describe('getToken', () => {
  test('extracts qoder_dash cookie from request', () => {
    const req = { headers: { cookie: 'qoder_dash=my-token; other=val' } };
    expect(getToken(req)).toBe('my-token');
  });

  test('returns null when no cookie present', () => {
    const req = { headers: { cookie: '' } };
    expect(getToken(req)).toBeNull();
  });

  test('returns null when no cookie header', () => {
    const req = { headers: {} };
    expect(getToken(req)).toBeNull();
  });
});

// ── dashboardAuth middleware ──────────────────────────────────────────────────

describe('dashboardAuth middleware', () => {
  const createRes = () => {
    const res = {
      statusCode: 200,
      _headers: {},
      _redirect: null,
      _json: null,
      setHeader(k, v) { this._headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this._json = body; return this; },
      redirect(url) { this._redirect = url; },
    };
    return res;
  };

  test('calls next() when valid cookie is present', () => {
    const token = createToken();
    const req = { headers: { cookie: `qoder_dash=${token}` }, path: '/api/config' };
    const res = createRes();
    const next = jest.fn();
    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('redirects to /dashboard/login for non-API paths without cookie', () => {
    const req = { headers: {}, path: '/' };
    const res = createRes();
    const next = jest.fn();
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._redirect).toBe('/dashboard/login');
  });

  test('returns 401 for /api/ paths without cookie', () => {
    const req = { headers: {}, path: '/api/config' };
    const res = createRes();
    const next = jest.fn();
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Not authenticated');
  });

  test('redirects for non-API paths with invalid cookie', () => {
    const req = { headers: { cookie: 'qoder_dash=invalid' }, path: '/' };
    const res = createRes();
    const next = jest.fn();
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._redirect).toBe('/dashboard/login');
  });

  test('returns 401 for API paths with invalid cookie', () => {
    const req = { headers: { cookie: 'qoder_dash=invalid' }, path: '/api/status' };
    const res = createRes();
    const next = jest.fn();
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
