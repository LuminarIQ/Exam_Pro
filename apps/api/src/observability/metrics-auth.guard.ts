import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.METRICS_PUBLIC === 'true') return true;

    const req = context.switchToHttp().getRequest();
    const configured = process.env.METRICS_TOKEN;
    if (!configured) {
      throw new UnauthorizedException('Metrics token is not configured');
    }

    const authHeader = req.headers['authorization'] as string | undefined;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const headerToken = (req.headers['x-metrics-token'] as string | undefined) || bearer;

    if (!headerToken || headerToken !== configured) {
      throw new UnauthorizedException('Unauthorized metrics access');
    }

    return true;
  }
}
