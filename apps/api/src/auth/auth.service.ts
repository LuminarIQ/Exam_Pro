import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MetricsService } from '../observability/metrics.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private static ipRisk = new Map<string, { failedCount: number; captchaUntil?: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly metrics: MetricsService,
  ) {}

  async register(tenantId: string, payload: { name: string; email: string; password: string; role: string }) {
    this.assertStrongPassword(payload.password);
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: payload.email } },
    });
    if (existing) throw new UnauthorizedException('Email already in use');

    const { token, tokenHash } = this.generateVerificationToken();
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: payload.name,
        email: payload.email,
        passwordHash,
        role: payload.role as any,
        emailVerificationTokenHash: tokenHash,
        passwordChangedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens(tenantId, user.id, user.role, user.email, {});
    return {
      ...tokens,
      emailVerificationRequired: true,
      verificationToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  async login(
    tenantId: string,
    payload: { email: string; password: string; captchaToken?: string },
    context: { userAgent?: string; ipAddress?: string; deviceName?: string },
  ) {
    this.assertCaptchaIfRequired(tenantId, context.ipAddress, payload.captchaToken);
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: payload.email } },
    });
    if (!user) {
      this.recordIpFailure(tenantId, context.ipAddress);
      this.metrics.authLoginTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.metrics.authLoginTotal.inc({ tenant: tenantId, result: 'locked' });
      throw new UnauthorizedException('Account is locked. Try again later.');
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      const maxFailed = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 5);
      const lockMinutes = Number(process.env.AUTH_LOCKOUT_MINUTES || 15);
      const nextAttempts = user.failedLoginAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil: nextAttempts >= maxFailed ? new Date(Date.now() + lockMinutes * 60 * 1000) : null,
        },
      });
      this.recordIpFailure(tenantId, context.ipAddress, nextAttempts >= maxFailed);
      this.metrics.authLoginTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const requireVerified = process.env.AUTH_REQUIRE_EMAIL_VERIFIED === 'true';
    if (requireVerified && !user.emailVerifiedAt) {
      throw new UnauthorizedException('Email verification required before login');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    this.clearIpRisk(tenantId, context.ipAddress);

    this.metrics.authLoginTotal.inc({ tenant: tenantId, result: 'success' });
    return this.issueTokens(tenantId, user.id, user.role, user.email, context);
  }

  async refresh(
    tenantId: string,
    refreshToken: string,
    context: { userAgent?: string; ipAddress?: string; deviceName?: string },
  ) {
    let decoded: any;
    try {
      decoded = this.jwt.verify(refreshToken, { secret: process.env.JWT_SECRET || 'supersecret' });
    } catch {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!decoded?.rtid || decoded.type !== 'refresh') {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        id: decoded.rtid,
        tenantId,
        userId: decoded.sub,
      },
      include: { session: true },
    });
    if (!stored) {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (stored.revokedAt || stored.expiresAt <= new Date()) {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Refresh token expired');
    }
    if (!stored.sessionId || !stored.session) {
      throw new UnauthorizedException('Session not found');
    }
    if (stored.session.revokedAt || stored.session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session expired');
    }
    if (
      process.env.AUTH_SESSION_BIND_USER_AGENT === 'true' &&
      stored.session.userAgent &&
      context.userAgent &&
      stored.session.userAgent !== context.userAgent
    ) {
      await this.prisma.userSession.updateMany({
        where: { id: stored.sessionId, tenantId, userId: decoded.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session device mismatch');
    }

    const match = await bcrypt.compare(refreshToken, stored.tokenHash);
    if (!match) {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'failure' });
      throw new UnauthorizedException('User not found');
    }
    if (user.passwordChangedAt && decoded.iat && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('Token issued before password change');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    if (stored.sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: stored.sessionId, tenantId, userId: decoded.sub, revokedAt: null },
        data: { lastSeenAt: new Date() },
      });
    }

    this.metrics.authRefreshTotal.inc({ tenant: tenantId, result: 'success' });
    return this.issueTokens(tenantId, user.id, user.role, user.email, context, stored.sessionId || undefined);
  }

  async logout(tenantId: string, userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.userSession.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async listSessions(tenantId: string, userId: string, currentSessionId?: string) {
    const now = new Date();
    const sessions = await this.prisma.userSession.findMany({
      where: { tenantId, userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      deviceName: s.deviceName,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      current: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  async logoutSession(tenantId: string, userId: string, sessionId: string) {
    const target = await this.prisma.userSession.findFirst({
      where: { id: sessionId, tenantId, userId, revokedAt: null },
    });
    if (!target) return { ok: true, revoked: 0 };
    await this.prisma.refreshToken.updateMany({
      where: { tenantId, userId, sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { ok: true, revoked: 1 };
  }

  async verifyEmail(tenantId: string, payload: { email: string; token: string }) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: payload.email } },
    });
    if (!user || !user.emailVerificationTokenHash) {
      throw new BadRequestException('Verification token invalid');
    }
    const match = await bcrypt.compare(payload.token, user.emailVerificationTokenHash);
    if (!match) throw new BadRequestException('Verification token invalid');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null },
    });
    return { verified: true };
  }

  async resendVerification(tenantId: string, payload: { email: string }) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: payload.email } },
    });
    if (!user) return { sent: true };
    if (user.emailVerifiedAt) return { sent: true };
    const { token, tokenHash } = this.generateVerificationToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationTokenHash: tokenHash },
    });
    return {
      sent: true,
      verificationToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  private async issueTokens(
    tenantId: string,
    userId: string,
    role: string,
    email: string,
    context: { userAgent?: string; ipAddress?: string; deviceName?: string },
    existingSessionId?: string,
  ) {
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = existingSessionId
      ? await this.prisma.userSession.update({
          where: { id: existingSessionId },
          data: {
            lastSeenAt: new Date(),
            revokedAt: null,
            expiresAt: sessionExpiresAt,
            userAgent: context.userAgent?.slice(0, 512),
            ipAddress: context.ipAddress?.slice(0, 128),
            deviceName: context.deviceName?.slice(0, 128),
          },
        })
      : await this.prisma.userSession.create({
          data: {
            tenantId,
            userId,
            userAgent: context.userAgent?.slice(0, 512),
            ipAddress: context.ipAddress?.slice(0, 128),
            deviceName: context.deviceName?.slice(0, 128),
            expiresAt: sessionExpiresAt,
          },
        });

    const accessToken = this.jwt.sign(
      { sub: userId, role, email, tenantId, sid: session.id },
      {
        secret: process.env.JWT_SECRET || 'supersecret',
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      },
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const refreshRecord = await this.prisma.refreshToken.create({
      data: { tenantId, userId, sessionId: session.id, tokenHash: 'pending', expiresAt },
    });

    const refreshToken = this.jwt.sign(
      { sub: userId, role, tenantId, type: 'refresh', rtid: refreshRecord.id },
      {
        secret: process.env.JWT_SECRET || 'supersecret',
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },
    );

    await this.prisma.refreshToken.update({
      where: { id: refreshRecord.id },
      data: { tokenHash: await bcrypt.hash(refreshToken, 10) },
    });

    return { accessToken, refreshToken };
  }

  private assertStrongPassword(password: string) {
    const minLen = Number(process.env.AUTH_PASSWORD_MIN_LENGTH || 8);
    if (password.length < minLen) {
      throw new BadRequestException(`Password must be at least ${minLen} characters`);
    }
    const upper = /[A-Z]/.test(password);
    const lower = /[a-z]/.test(password);
    const digit = /\d/.test(password);
    const special = /[^A-Za-z0-9]/.test(password);
    if (!upper || !lower || !digit || !special) {
      throw new BadRequestException('Password must include upper, lower, number, and special character');
    }
  }

  private generateVerificationToken() {
    const token = crypto.randomBytes(24).toString('hex');
    return { token, tokenHash: bcrypt.hashSync(token, 10) };
  }

  private riskKey(tenantId: string, ipAddress?: string) {
    return `${tenantId}:${ipAddress || 'unknown'}`;
  }

  private recordIpFailure(tenantId: string, ipAddress?: string, forceCaptcha = false) {
    const key = this.riskKey(tenantId, ipAddress);
    const current = AuthService.ipRisk.get(key) || { failedCount: 0 };
    current.failedCount += 1;
    const threshold = Number(process.env.AUTH_CAPTCHA_AFTER_FAILED_ATTEMPTS || 3);
    if (forceCaptcha || current.failedCount >= threshold) {
      const ttlMin = Number(process.env.AUTH_CAPTCHA_REQUIRED_MINUTES || 30);
      current.captchaUntil = Date.now() + ttlMin * 60 * 1000;
    }
    AuthService.ipRisk.set(key, current);
  }

  private clearIpRisk(tenantId: string, ipAddress?: string) {
    AuthService.ipRisk.delete(this.riskKey(tenantId, ipAddress));
  }

  private assertCaptchaIfRequired(tenantId: string, ipAddress?: string, captchaToken?: string) {
    const key = this.riskKey(tenantId, ipAddress);
    const state = AuthService.ipRisk.get(key);
    if (!state?.captchaUntil || state.captchaUntil <= Date.now()) return;
    const bypassToken = process.env.AUTH_CAPTCHA_BYPASS_TOKEN || 'dev-captcha-ok';
    if (!captchaToken || captchaToken !== bypassToken) {
      throw new UnauthorizedException('CAPTCHA required due to repeated failed login attempts');
    }
  }
}
