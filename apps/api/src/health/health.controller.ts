import { Controller, Get, Res } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { MetricsService } from '../observability/metrics.service';
import { Response } from 'express';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  health() {
    this.metrics.serviceLiveness.set({ component: 'api' }, 1);
    return { status: 'ok', at: new Date().toISOString() };
  }

  @Get('live')
  live() {
    this.metrics.serviceLiveness.set({ component: 'api' }, 1);
    return { alive: true, at: new Date().toISOString() };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const checks: Record<string, string> = { db: 'down', redis: 'down' };
    const requireRedis = process.env.READINESS_REQUIRE_REDIS === 'true';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'up';
    } catch {
      checks.db = 'down';
    }

    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    } finally {
      redis.disconnect();
    }

    const ready = checks.db === 'up' && (!requireRedis || checks.redis === 'up');
    this.metrics.serviceReadiness.set({ component: 'db' }, checks.db === 'up' ? 1 : 0);
    this.metrics.serviceReadiness.set({ component: 'redis' }, checks.redis === 'up' ? 1 : 0);
    this.metrics.serviceReadiness.set({ component: 'api' }, ready ? 1 : 0);
    if (!ready) {
      return res.status(503).json({ ready, checks, requireRedis });
    }
    return res.status(200).json({ ready, checks, requireRedis });
  }
}
