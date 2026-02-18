import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StartDiagnosticSchema, SubmitAttemptSchema } from '@pkg/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('attempts')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post('diagnostic/start')
  @Roles('STUDENT')
  start(@Req() req: any, @Body(new ZodValidationPipe(StartDiagnosticSchema)) body: any) {
    return this.attemptsService.startDiagnostic(req.tenantId, req.user.sub, body);
  }

  @Post(':id/submit')
  @Roles('STUDENT')
  submit(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitAttemptSchema)) body: any,
  ) {
    return this.attemptsService.submitAttempt(req.tenantId, req.user.sub, id, body);
  }

  @Get(':id')
  @Roles('STUDENT')
  getAttempt(@Req() req: any, @Param('id') id: string) {
    return this.attemptsService.getAttempt(req.tenantId, req.user.sub, id);
  }

  @Get(':id/analysis')
  @Roles('STUDENT')
  analysis(@Req() req: any, @Param('id') id: string) {
    return this.attemptsService.diagnosticAnalysis(req.tenantId, req.user.sub, id);
  }

  @Get('student/dashboard')
  @Roles('STUDENT')
  dashboard(@Req() req: any) {
    return this.attemptsService.studentDashboard(req.tenantId, req.user.sub);
  }

  @Get('student/next-best-action')
  @Roles('STUDENT')
  nextBestAction(@Req() req: any) {
    return this.attemptsService.nextBestActionForStudent(req.tenantId, req.user.sub);
  }
}
