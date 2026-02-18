import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecret',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const tenantId = req?.tenantId || payload?.tenantId;
    if (!tenantId || payload?.tenantId !== tenantId) {
      throw new UnauthorizedException('Tenant mismatch');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId },
      select: {
        id: true,
        role: true,
        email: true,
        tenantId: true,
        lockedUntil: true,
        passwordChangedAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found for tenant');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is locked');
    }
    if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('Access token invalid after password change');
    }
    if (payload.sid) {
      const session = await this.prisma.userSession.findFirst({
        where: {
          id: payload.sid,
          tenantId,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new UnauthorizedException('Session is invalid');
    }

    return { sub: user.id, role: user.role, email: user.email, tenantId: user.tenantId, sid: payload.sid };
  }
}
