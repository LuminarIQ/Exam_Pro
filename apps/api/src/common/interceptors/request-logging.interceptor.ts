import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { StructuredLogger } from '../structured-logger';
import { MetricsService } from '../../observability/metrics.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLogger,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const route = req.route?.path || req.originalUrl || req.url || 'unknown';
          const status = String(res.statusCode || 200);
          const tenant = req.tenantId || 'public';
          const labels = { method: req.method, route, status, tenant };
          const duration = Date.now() - started;
          this.metrics.httpRequestsTotal.inc(labels);
          this.metrics.httpRequestDurationMs.observe(labels, duration);
          this.logger.log(
            {
              method: req.method,
              path: route,
              statusCode: res.statusCode,
              durationMs: duration,
              correlationId: req.correlationId,
              tenantId: req.tenantId,
              userId: req.user?.sub,
            },
            'Request',
          );
        },
        error: (err) => {
          const route = req.route?.path || req.originalUrl || req.url || 'unknown';
          const status = String(err?.status || 500);
          const tenant = req.tenantId || 'public';
          const labels = { method: req.method, route, status, tenant };
          const duration = Date.now() - started;
          this.metrics.httpRequestsTotal.inc(labels);
          this.metrics.httpRequestDurationMs.observe(labels, duration);
          this.logger.error(
            {
              method: req.method,
              path: route,
              statusCode: err?.status || 500,
              durationMs: duration,
              correlationId: req.correlationId,
              tenantId: req.tenantId,
              userId: req.user?.sub,
              message: err?.message,
            },
            undefined,
            'Request',
          );
        },
      }),
    );
  }
}
