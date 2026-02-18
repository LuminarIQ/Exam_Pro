import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private tenantCache = new Map<string, number>();
  private readonly cacheTtlMs = Number(process.env.TENANT_CACHE_TTL_MS || 60_000);

  constructor(private readonly prisma?: PrismaService) {}

  async use(req: Request & { tenantId?: string }, _res: Response, next: NextFunction) {
    if (this.shouldBypass(req)) {
      req.tenantId = (process.env.DEFAULT_TENANT_ID || 'public').trim().toLowerCase();
      next();
      return;
    }

    const raw = ((req.headers['x-tenant-id'] as string) || process.env.DEFAULT_TENANT_ID || 'public').trim();
    const tenantId = raw.toLowerCase();
    if (!tenantId) {
      throw new BadRequestException('Missing tenant id');
    }

    const cachedAt = this.tenantCache.get(tenantId);
    if (this.prisma && (!cachedAt || Date.now() - cachedAt > this.cacheTtlMs)) {
      const exists = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!exists) {
        throw new BadRequestException(`Invalid tenant id: ${tenantId}`);
      }
      this.tenantCache.set(tenantId, Date.now());
    }

    req.tenantId = tenantId;
    next();
  }

  private shouldBypass(req: Request) {
    const path = (req.originalUrl || req.url || '').split('?')[0].toLowerCase();
    return (
      path.startsWith('/api/health') ||
      path.startsWith('/health')
    );
  }
}
