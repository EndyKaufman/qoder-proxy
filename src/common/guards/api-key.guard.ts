import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.configService.get<string | null>('API_KEY');
    if (!apiKey) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
    }>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const res = context.switchToHttp().getResponse<{
        status: (code: number) => { json: (body: unknown) => void };
      }>();
      res.status(401).json({
        error: {
          message:
            'Missing or invalid Authorization header. Expected: Bearer <token>',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
      return false;
    }

    const token = authHeader.slice(7);
    if (token !== apiKey) {
      const res = context.switchToHttp().getResponse<{
        status: (code: number) => { json: (body: unknown) => void };
      }>();
      res.status(401).json({
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
      return false;
    }

    return true;
  }
}
