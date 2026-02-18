import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePrerequisiteSchema, CreateTaxonomySchema } from '@pkg/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('taxonomy')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  @Roles('TEACHER', 'ADMIN', 'STUDENT')
  list(@Req() req: any) {
    return this.taxonomyService.list(req.tenantId);
  }

  @Post('subjects')
  @Roles('ADMIN')
  createSubject(@Req() req: any, @Body(new ZodValidationPipe(CreateTaxonomySchema)) body: any) {
    return this.taxonomyService.createSubject(req.tenantId, body.name);
  }

  @Post('chapters')
  @Roles('ADMIN')
  createChapter(@Req() req: any, @Body(new ZodValidationPipe(CreateTaxonomySchema)) body: any) {
    return this.taxonomyService.createChapter(req.tenantId, body.subjectId, body.name);
  }

  @Post('topics')
  @Roles('ADMIN')
  createTopic(@Req() req: any, @Body(new ZodValidationPipe(CreateTaxonomySchema)) body: any) {
    return this.taxonomyService.createTopic(req.tenantId, body.chapterId, body.name);
  }

  @Post('prerequisites')
  @Roles('ADMIN')
  createPrerequisite(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreatePrerequisiteSchema)) body: any,
  ) {
    return this.taxonomyService.createPrerequisite(req.tenantId, body.topicId, body.prerequisiteTopicId);
  }

  @Patch(':entity/:id')
  @Roles('ADMIN')
  rename(
    @Req() req: any,
    @Param('entity') entity: 'subject' | 'chapter' | 'topic',
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.taxonomyService.updateName(req.tenantId, entity, id, body.name);
  }

  @Delete(':entity/:id')
  @Roles('ADMIN')
  remove(
    @Req() req: any,
    @Param('entity') entity: 'subject' | 'chapter' | 'topic',
    @Param('id') id: string,
  ) {
    return this.taxonomyService.remove(req.tenantId, entity, id);
  }
}
