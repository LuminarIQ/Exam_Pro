import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'supersecret',
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthRateLimitGuard],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
