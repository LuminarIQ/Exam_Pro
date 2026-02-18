import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common';
import { TenantMiddleware } from '../src/common/middleware/tenant.middleware';
import { Roles } from '../src/common/decorators/roles.decorator';
import { RbacGuard } from '../src/common/guards/rbac.guard';
import { NextFunction, Request, Response } from 'express';

const request = require('supertest');

@Controller('auth')
class AuthTestController {
  @Post('login')
  login(@Req() req: any, @Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) throw new UnauthorizedException('Missing credentials');
    return { tenantId: req.tenantId, accessToken: 'a', refreshToken: 'r' };
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken?: string }) {
    if (!body.refreshToken) throw new UnauthorizedException('Missing refresh token');
    return { accessToken: 'a2', refreshToken: 'r2' };
  }
}

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-role'];
    if (!role) throw new ForbiddenException('No role');
    req.user = { role, tenantId: req.headers['x-user-tenant'] || req.headers['x-tenant-id'] || 'public' };
    return true;
  }
}

@Controller('secure')
@UseGuards(HeaderAuthGuard, RbacGuard)
class SecureController {
  @Get('student')
  @Roles('STUDENT')
  student() {
    return { ok: true };
  }
}

describe('Flows (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthTestController, SecureController],
      providers: [HeaderAuthGuard, RbacGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: Request, res: Response, next: NextFunction) =>
      new TenantMiddleware().use(req as any, res as any, next),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses default tenant when header missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'x@y.com', password: 'secret123' })
      .expect(201);

    expect(res.body.tenantId).toBe('public');
  });

  it('uses tenant from x-tenant-id header', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', 'school-a')
      .send({ email: 'x@y.com', password: 'secret123' })
      .expect(201);

    expect(res.body.tenantId).toBe('school-a');
  });

  it('supports refresh flow contract', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(401);

    const ok = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'token' })
      .expect(201);

    expect(ok.body.accessToken).toBeDefined();
    expect(ok.body.refreshToken).toBeDefined();
  });

  it('allows STUDENT role and blocks TEACHER role on student endpoint', async () => {
    await request(app.getHttpServer()).get('/secure/student').set('x-role', 'STUDENT').expect(200);

    await request(app.getHttpServer()).get('/secure/student').set('x-role', 'TEACHER').expect(403);
  });

  it('blocks cross-tenant access when user tenant does not match request tenant', async () => {
    await request(app.getHttpServer())
      .get('/secure/student')
      .set('x-role', 'STUDENT')
      .set('x-tenant-id', 'school-a')
      .set('x-user-tenant', 'school-b')
      .expect(403);
  });
});
