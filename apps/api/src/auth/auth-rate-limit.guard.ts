import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private static readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const tenant = req.tenantId || 'public';
    const route = req.route?.path || req.url || 'auth';

    const ttlMs = Number(process.env.AUTH_RATE_LIMIT_TTL_MS || 60_000);
    const limit = Number(process.env.AUTH_RATE_LIMIT_MAX || 12);
    const key = `${tenant}:${ip}:${route}`;

    const now = Date.now();
    const existing = AuthRateLimitGuard.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      AuthRateLimitGuard.buckets.set(key, { count: 1, resetAt: now + ttlMs });
      return true;
    }

    if (existing.count >= limit) {
      throw new HttpException('Too many requests. Please retry later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    existing.count += 1;
    AuthRateLimitGuard.buckets.set(key, existing);
    return true;
  }
}
