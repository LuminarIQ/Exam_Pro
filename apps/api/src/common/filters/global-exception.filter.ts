import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'object' && exceptionResponse && 'message' in exceptionResponse
        ? (exceptionResponse as any).message
        : isHttpException
          ? exception.message
          : 'Internal server error';

    const details = typeof exceptionResponse === 'object' ? exceptionResponse : undefined;

    response.status(status).json({
      success: false,
      error: {
        code: isHttpException ? exception.constructor.name : 'InternalServerError',
        message,
        details,
      },
      meta: {
        path: request.url,
        method: request.method,
        correlationId: request.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
