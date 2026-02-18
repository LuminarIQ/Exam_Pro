import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiService } from './ai.service';
import { Get } from '@nestjs/common';

@Controller('ai')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-question')
  @Roles('TEACHER', 'ADMIN')
  enqueue(@Req() req: any, @Body() body: { topicIds: string[]; promptVersion?: string }) {
    return this.aiService.enqueueGenerateQuestion(req.tenantId, req.user.sub, body);
  }

  @Get('queue-metrics')
  @Roles('ADMIN', 'TEACHER')
  metrics() {
    return this.aiService.queueMetrics();
  }
}
