import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CreateTopicResourceSchema,
  CreateAdminUserSchema,
  UpdateQuestionStatusSchema,
  UpdateUserRoleSchema,
} from '@pkg/shared';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';

@Controller('admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Req() req: any) {
    return this.admin.users(req.tenantId);
  }

  @Post('users')
  createUser(@Req() req: any, @Body(new ZodValidationPipe(CreateAdminUserSchema)) body: any) {
    return this.admin.createUser(req.tenantId, req.user.sub, body);
  }

  @Patch('users/:id/role')
  role(@Req() req: any, @Param('id') id: string, @Body(new ZodValidationPipe(UpdateUserRoleSchema)) body: any) {
    return this.admin.updateUserRole(req.tenantId, req.user.sub, id, body.role);
  }

  @Patch('questions/:id/status')
  questionStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateQuestionStatusSchema)) body: any,
  ) {
    return this.admin.setQuestionStatus(req.tenantId, req.user.sub, id, body.status);
  }

  @Get('questions')
  questions(@Req() req: any) {
    return this.admin.questions(req.tenantId);
  }

  @Get('topic-resources')
  topicResources(@Req() req: any) {
    return this.admin.topicResources(req.tenantId);
  }

  @Post('topic-resources')
  createTopicResource(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateTopicResourceSchema)) body: any,
  ) {
    return this.admin.createTopicResource(req.tenantId, req.user.sub, body);
  }

  @Patch('topic-resources/:id/deactivate')
  deactivateTopicResource(@Req() req: any, @Param('id') id: string) {
    return this.admin.deactivateTopicResource(req.tenantId, req.user.sub, id);
  }

  @Post('question-bank/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadQuestionBank(@Req() req: any, @UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('CSV file is required');
    const csv = file.buffer ? file.buffer.toString('utf-8') : fs.readFileSync(file.path, 'utf-8');
    return this.admin.importQuestionBankCsv(req.tenantId, req.user.sub, csv);
  }

  @Get('audit-logs')
  logs(@Req() req: any) {
    return this.admin.logs(req.tenantId);
  }

  @Get('tenant-metrics')
  tenantMetrics(@Req() req: any) {
    return this.admin.tenantMetrics(req.tenantId);
  }

  @Get('ai-governance')
  aiGovernance(@Req() req: any) {
    return this.admin.aiGovernance(req.tenantId);
  }
}
