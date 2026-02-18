import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { QuestionsModule } from './questions/questions.module';
import { AttemptsModule } from './attempts/attempts.module';
import { EloModule } from './elo/elo.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { StructuredLogger } from './common/structured-logger';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TaxonomyModule,
    QuestionsModule,
    AttemptsModule,
    EloModule,
    FlashcardsModule,
    AiModule,
    AdminModule,
    HealthModule,
    ObservabilityModule,
  ],
  providers: [StructuredLogger, TenantMiddleware, CorrelationIdMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, TenantMiddleware).forRoutes('*');
  }
}
