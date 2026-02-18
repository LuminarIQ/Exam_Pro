import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginSchema,
  LogoutSessionSchema,
  RegisterSchema,
  ResendVerificationSchema,
  VerifyEmailSchema,
} from '@pkg/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { Response } from 'express';
import * as crypto from 'crypto';
import { MetricsService } from '../observability/metrics.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly metrics: MetricsService,
  ) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    if (process.env.AUTH_COOKIE_MODE !== 'true') return;
    res.cookie(process.env.REFRESH_COOKIE_NAME || 'rt', refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax',
      maxAge: Number(process.env.REFRESH_COOKIE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
      path: '/api/auth',
      signed: false,
    });
  }

  private clearRefreshCookie(res: Response) {
    if (process.env.AUTH_COOKIE_MODE !== 'true') return;
    res.clearCookie(process.env.REFRESH_COOKIE_NAME || 'rt', { path: '/api/auth' });
  }

  private setCsrfCookie(res: Response, csrfToken: string) {
    if (process.env.AUTH_COOKIE_MODE !== 'true') return;
    res.cookie(process.env.CSRF_COOKIE_NAME || 'csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax',
      maxAge: Number(process.env.REFRESH_COOKIE_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000),
      path: '/api',
      signed: true,
    });
  }

  private clearCsrfCookie(res: Response) {
    if (process.env.AUTH_COOKIE_MODE !== 'true') return;
    res.clearCookie(process.env.CSRF_COOKIE_NAME || 'csrf_token', { path: '/api' });
  }

  private issueCsrfToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  private assertCsrf(req: any) {
    if (process.env.AUTH_COOKIE_MODE !== 'true') return;
    const cookieName = process.env.CSRF_COOKIE_NAME || 'csrf_token';
    const cookieToken = req.signedCookies?.[cookieName] || req.cookies?.[cookieName];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      this.metrics.authCsrfFailuresTotal.inc({ tenant: req.tenantId || 'public' });
      throw new UnauthorizedException('Invalid CSRF token');
    }
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: any,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(req.tenantId, body);
    const csrfToken = this.issueCsrfToken();
    this.setRefreshCookie(res, tokens.refreshToken);
    this.setCsrfCookie(res, csrfToken);
    return process.env.AUTH_COOKIE_MODE === 'true'
      ? { accessToken: tokens.accessToken, csrfToken }
      : tokens;
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: any,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(req.tenantId, body, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      deviceName: req.headers['x-device-name'],
    });
    const csrfToken = this.issueCsrfToken();
    this.setRefreshCookie(res, tokens.refreshToken);
    this.setCsrfCookie(res, csrfToken);
    return process.env.AUTH_COOKIE_MODE === 'true'
      ? { accessToken: tokens.accessToken, csrfToken }
      : tokens;
  }

  @Post('refresh')
  @UseGuards(AuthRateLimitGuard)
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[process.env.REFRESH_COOKIE_NAME || 'rt'];
    if (cookieToken && !body.refreshToken) this.assertCsrf(req);
    const token = body.refreshToken || cookieToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    const tokens = await this.authService.refresh(req.tenantId, token, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      deviceName: req.headers['x-device-name'],
    });
    const csrfToken = this.issueCsrfToken();
    this.setRefreshCookie(res, tokens.refreshToken);
    this.setCsrfCookie(res, csrfToken);
    return process.env.AUTH_COOKIE_MODE === 'true'
      ? { accessToken: tokens.accessToken, csrfToken }
      : tokens;
  }

  @Post('verify-email')
  verifyEmail(@Req() req: any, @Body(new ZodValidationPipe(VerifyEmailSchema)) body: any) {
    return this.authService.verifyEmail(req.tenantId, body);
  }

  @Post('resend-verification')
  resendVerification(@Req() req: any, @Body(new ZodValidationPipe(ResendVerificationSchema)) body: any) {
    return this.authService.resendVerification(req.tenantId, body);
  }

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = this.issueCsrfToken();
    this.setCsrfCookie(res, csrfToken);
    return { csrfToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    this.assertCsrf(req);
    this.clearRefreshCookie(res);
    this.clearCsrfCookie(res);
    return this.authService.logout(req.tenantId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@Req() req: any) {
    return this.authService.listSessions(req.tenantId, req.user.sub, req.user.sid);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-session')
  logoutSession(
    @Req() req: any,
    @Body(new ZodValidationPipe(LogoutSessionSchema)) body: { sessionId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCsrf(req);
    const sessionId = body.sessionId || req.user.sid;
    if (!sessionId) throw new UnauthorizedException('Session id is required');
    if (req.user.sid === sessionId) {
      this.clearRefreshCookie(res);
      this.clearCsrfCookie(res);
    }
    return this.authService.logoutSession(req.tenantId, req.user.sub, sessionId);
  }
}
