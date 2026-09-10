import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // If headers were already sent (e.g. by a guard or streaming handler),
    // we cannot send another response — just log and bail out.
    if (response.headersSent) {
      console.error('[GlobalExceptionFilter] Headers already sent, cannot respond:', exception);
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      message =
        typeof exResponse === 'string'
          ? exResponse
          : (exResponse as Record<string, unknown>).message as string ||
            exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
      stack = exception.stack;
    }

    response.status(status).json({
      error: {
        message,
        type: 'server_error',
        ...(process.env.NODE_ENV !== 'production' ? { stack } : {}),
      },
    });
  }
}
