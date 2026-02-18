import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApproveQuestionSchema, CreateQuestionSchema, RejectQuestionSchema } from '@pkg/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('questions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @Roles('STUDENT', 'TEACHER', 'ADMIN')
  list(@Req() req: any) {
    return this.questionsService.listPublished(req.tenantId);
  }

  @Post()
  @Roles('TEACHER', 'ADMIN')
  create(@Req() req: any, @Body(new ZodValidationPipe(CreateQuestionSchema)) body: any) {
    return this.questionsService.create(req.tenantId, req.user.sub, body);
  }

  @Get('review-queue')
  @Roles('TEACHER', 'ADMIN')
  reviewQueue(@Req() req: any) {
    return this.questionsService.listReviewQueue(req.tenantId);
  }

  @Patch(':id')
  @Roles('TEACHER', 'ADMIN')
  updateDraft(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateQuestionSchema)) body: any,
  ) {
    return this.questionsService.updateDraft(req.tenantId, id, body);
  }

  @Get(':id/rubric-validate')
  @Roles('TEACHER', 'ADMIN')
  rubricValidate(@Req() req: any, @Param('id') id: string) {
    return this.questionsService.validateRubric(req.tenantId, id);
  }

  @Post('approve')
  @Roles('TEACHER', 'ADMIN')
  approve(@Req() req: any, @Body(new ZodValidationPipe(ApproveQuestionSchema)) body: any) {
    return this.questionsService.approve(req.tenantId, body.questionId, body.publish);
  }

  @Post('reject')
  @Roles('TEACHER', 'ADMIN')
  reject(@Req() req: any, @Body(new ZodValidationPipe(RejectQuestionSchema)) body: any) {
    return this.questionsService.reject(req.tenantId, body.questionId);
  }
}
