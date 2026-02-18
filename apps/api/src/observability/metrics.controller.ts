import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @UseGuards(MetricsAuthGuard)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsText() {
    return this.metrics.scrape();
  }
}
