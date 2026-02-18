import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FlashcardsService } from './flashcards.service';
import { ReviewFlashcardSchema } from '@pkg/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('flashcards')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('STUDENT')
export class FlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Get('due')
  due(@Req() req: any) {
    return this.flashcards.due(req.tenantId, req.user.sub);
  }

  @Post(':id/review')
  review(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReviewFlashcardSchema)) body: any,
  ) {
    return this.flashcards.review(req.tenantId, req.user.sub, id, body.quality);
  }
}
