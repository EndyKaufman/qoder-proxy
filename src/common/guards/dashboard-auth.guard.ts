import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { AppConfig } from '../../config/configuration';

const COOKIE = 'qoder_dash';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const hmac = (data: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');

export const createToken = (secret: string): string => {
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  return Buffer.from(`${payload}.${hmac(payload, secret)}`).toString(
    'base64url',
  );
};

const verifyToken = (token: string, secret: string): boolean => {
  try {
    const raw = Buffer.from(token, 'base64url').toString();
    const cut = raw.lastIndexOf('.');
    const data = raw.slice(0, cut);
    const sig = raw.slice(cut + 1);
    return sig === hmac(data, secret);
  } catch {
    return false;
  }
};

const parseCookies = (
  cookieHeader: string | undefined,
): Record<string, string> =>
  Object.fromEntries(
    (cookieHeader || '').split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    }),
  );

export const setCookie = (
  setHeader: (name: string, value: string) => void,
  token: string,
): void =>
  setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}; Path=/`,
  );

export const clearCookie = (setHeader: (name: string, value: string) => void): void =>
  setHeader(
    'Set-Cookie',
    `${COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`,
  );

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  constructor(private configService: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret =
      this.configService.get<string>('DASHBOARD_SECRET') || '';
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      path: string;
    }>();
    const response = context.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
      redirect: (url: string) => void;
    }>();

    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[COOKIE] || null;

    if (token && verifyToken(token, secret)) return true;

    if (request.path.startsWith('/dashboard/api/')) {
      response.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    response.redirect('/dashboard/login');
    return false;
  }
}
