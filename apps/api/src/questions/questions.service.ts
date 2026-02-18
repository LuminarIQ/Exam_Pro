import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionSource, QuestionStatus } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, payload: any) {
    if (payload.options.filter((o: any) => o.isCorrect).length !== 1) {
      throw new BadRequestException('Exactly one option must be correct');
    }

    return this.prisma.question.create({
      data: {
        tenantId,
        stem: payload.stem,
        explanation: payload.explanation,
        expectedSolveTimeSec: payload.expectedSolveTimeSec,
        source: payload.source as QuestionSource,
        status: payload.source === 'AI' ? QuestionStatus.DRAFT : QuestionStatus.APPROVED,
        difficulty: payload.difficulty,
        createdById: userId,
        options: { create: payload.options.map((o: any) => ({ tenantId, text: o.text, isCorrect: o.isCorrect })) },
        topicMaps: { create: payload.topicIds.map((topicId: string) => ({ tenantId, topicId, weight: 1 })) },
      },
      include: { options: true, topicMaps: true },
    });
  }

  listReviewQueue(tenantId: string) {
    return this.prisma.question.findMany({
      where: { tenantId, status: 'DRAFT' },
      include: { options: true, topicMaps: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listPublished(tenantId: string) {
    return this.prisma.question.findMany({
      where: { tenantId, status: { in: ['APPROVED', 'PUBLISHED'] } },
      include: { options: true, topicMaps: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(tenantId: string, questionId: string, publish: boolean) {
    const existing = await this.prisma.question.findFirst({ where: { id: questionId, tenantId } });
    if (!existing) throw new BadRequestException('Question not found');
    return this.prisma.question.update({
      where: { id: questionId },
      data: { status: publish ? 'PUBLISHED' : 'APPROVED' },
    });
  }

  async reject(tenantId: string, questionId: string) {
    const existing = await this.prisma.question.findFirst({ where: { id: questionId, tenantId } });
    if (!existing) throw new BadRequestException('Question not found');
    return this.prisma.question.update({
      where: { id: questionId },
      data: { status: 'ARCHIVED' },
    });
  }

  async updateDraft(tenantId: string, questionId: string, payload: any) {
    const existing = await this.prisma.question.findFirst({ where: { id: questionId, tenantId } });
    if (!existing) throw new BadRequestException('Question not found');
    if (payload.options.filter((o: any) => o.isCorrect).length !== 1) {
      throw new BadRequestException('Exactly one option must be correct');
    }
    await this.prisma.questionOption.deleteMany({ where: { tenantId, questionId } });
    await this.prisma.questionTopicMap.deleteMany({ where: { tenantId, questionId } });

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        stem: payload.stem,
        explanation: payload.explanation,
        expectedSolveTimeSec: payload.expectedSolveTimeSec,
        difficulty: payload.difficulty,
        options: { create: payload.options.map((o: any) => ({ tenantId, text: o.text, isCorrect: o.isCorrect })) },
        topicMaps: { create: payload.topicIds.map((topicId: string) => ({ tenantId, topicId, weight: 1 })) },
      },
      include: { options: true, topicMaps: true },
    });
  }
}
