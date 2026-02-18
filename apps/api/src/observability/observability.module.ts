import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Global()
@Module({
  providers: [MetricsService, MetricsAuthGuard],
  exports: [MetricsService],
  controllers: [MetricsController],
})
export class ObservabilityModule {}
