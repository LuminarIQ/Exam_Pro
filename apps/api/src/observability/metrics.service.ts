import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'adaptive_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status', 'tenant'],
    registers: [this.registry],
  });

  readonly httpRequestDurationMs = new Histogram({
    name: 'adaptive_http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'route', 'status', 'tenant'],
    buckets: [10, 25, 50, 100, 200, 400, 800, 1200, 2000],
    registers: [this.registry],
  });

  readonly authLoginTotal = new Counter({
    name: 'adaptive_auth_login_total',
    help: 'Authentication login attempts',
    labelNames: ['tenant', 'result'],
    registers: [this.registry],
  });

  readonly authRefreshTotal = new Counter({
    name: 'adaptive_auth_refresh_total',
    help: 'Authentication refresh attempts',
    labelNames: ['tenant', 'result'],
    registers: [this.registry],
  });

  readonly aiJobsTotal = new Counter({
    name: 'adaptive_ai_jobs_total',
    help: 'AI job outcomes',
    labelNames: ['tenant', 'status'],
    registers: [this.registry],
  });

  readonly aiQuotaUsed = new Gauge({
    name: 'adaptive_ai_quota_used',
    help: 'AI quota usage by tenant',
    labelNames: ['tenant'],
    registers: [this.registry],
  });

  readonly aiQuotaLimit = new Gauge({
    name: 'adaptive_ai_quota_limit',
    help: 'AI quota limit by tenant',
    labelNames: ['tenant'],
    registers: [this.registry],
  });

  readonly serviceReadiness = new Gauge({
    name: 'adaptive_service_readiness',
    help: 'Service readiness status (1=ready, 0=not ready)',
    labelNames: ['component'],
    registers: [this.registry],
  });

  readonly serviceLiveness = new Gauge({
    name: 'adaptive_service_liveness',
    help: 'Service liveness status (1=alive)',
    labelNames: ['component'],
    registers: [this.registry],
  });

  readonly authCsrfFailuresTotal = new Counter({
    name: 'adaptive_auth_csrf_failures_total',
    help: 'CSRF validation failures',
    labelNames: ['tenant'],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry, prefix: 'adaptive_' });
  }

  async scrape() {
    return this.registry.metrics();
  }
}
