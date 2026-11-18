import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected server error occurred.';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
        code = statusToDefaultCode(status);
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        code = typeof body.code === 'string' ? body.code : statusToDefaultCode(status);
        if (Array.isArray(body.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Request validation failed.';
          details = { issues: body.message };
        } else {
          message =
            typeof body.message === 'string'
              ? body.message
              : exception.message || 'Request failed.';
          details = body.details;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    res.status(status).json({
      success: false,
      data: null,
      meta: {
        requestId: req.requestId ?? req.header('x-correlation-id') ?? crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      },
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }
}

function statusToDefaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'RESOURCE_NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'BUSINESS_RULE_VIOLATION';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMIT_EXCEEDED';
    default:
      return 'HTTP_ERROR';
  }
}

