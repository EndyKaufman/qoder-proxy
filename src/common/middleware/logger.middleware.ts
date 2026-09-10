import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LogStoreService } from '../../log-store/log-store.service';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private logStoreService: LogStoreService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const requestPayload =
      req.body && Object.keys(req.body).length > 0 ? req.body : null;

    let responsePayload: unknown = null;
    let isStream = false;
    let streamText = '';
    let streamChunks = 0;

    const origJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.headersSent) return res;
      responsePayload = body;
      return origJson(body);
    };

    const origWrite = res.write.bind(res);
    res.write = (chunk: any, ...args: unknown[]) => {
      isStream = true;
      const raw = chunk.toString();
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const d = JSON.parse(line.slice(6));
          const delta =
            d.choices?.[0]?.delta?.content ??
            d.choices?.[0]?.text ??
            (typeof d.result === 'string' ? d.result : '') ??
            '';
          if (delta) {
            streamText += delta;
            streamChunks++;
          }
        } catch {
          /* ignore parse errors */
        }
      }
      return origWrite(chunk, ...(args as [any, any]));
    };

    res.on('finish', () => {
      const ms = Date.now() - start;
      const ts = new Date().toISOString();
      const tag = isStream ? ' [stream]' : '';
      console.log(
        `[${ts}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)${tag}`,
      );

      const path = req.path;
      const originalUrl = req.originalUrl;
      if (
        path.startsWith('/v1') ||
        path.startsWith('/api/chat') ||
        originalUrl.startsWith('/v1')
      ) {
        this.logStoreService.addRequest({
          method: req.method,
          path: originalUrl,
          statusCode: res.statusCode,
          durationMs: ms,
          isStream,
          streamChunks: isStream ? streamChunks : undefined,
          requestPayload,
          responsePayload: isStream
            ? streamText || null
            : responsePayload,
          error:
            res.statusCode >= 400
              ? ((responsePayload as Record<string, unknown>)?.error ?? null)
              : null,
        });
      }
    });

    next();
  }
}
