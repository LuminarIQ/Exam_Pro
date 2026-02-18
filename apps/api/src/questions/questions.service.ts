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
    const existing = await this.prisma.question.findFirst({
      where: { id: questionId, tenantId },
      include: { options: true, topicMaps: true },
    });
    if (!existing) throw new BadRequestException('Question not found');
    if (existing.source === 'AI') {
      const rubric = await this.validateRubricInternal(tenantId, existing.id, existing);
      if (!rubric.valid) {
        throw new BadRequestException({
          message: 'Rubric validation failed. Resolve issues before approval.',
          rubric,
        });
      }
    }
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

  async validateRubric(tenantId: string, questionId: string) {
    return this.validateRubricInternal(tenantId, questionId);
  }

  private async validateRubricInternal(tenantId: string, questionId: string, existingQuestion?: any) {
    const question =
      existingQuestion ||
      (await this.prisma.question.findFirst({
        where: { id: questionId, tenantId },
        include: { options: true, topicMaps: true },
      }));
    if (!question) throw new BadRequestException('Question not found');

    const checks: Array<{ key: string; passed: boolean; details: string }> = [];
    const push = (key: string, passed: boolean, details: string) => checks.push({ key, passed, details });

    const stemLen = (question.stem || '').trim().length;
    push('stem_quality', stemLen >= 12, `Stem length ${stemLen} (min 12)`);
    const explanationLen = (question.explanation || '').trim().length;
    push('explanation_quality', explanationLen >= 12, `Explanation length ${explanationLen} (min 12)`);

    push(
      'option_count',
      question.options.length === 4,
      `Option count ${question.options.length} (required 4)`,
    );
    const correctCount = question.options.filter((o: any) => o.isCorrect).length;
    push('single_correct', correctCount === 1, `Correct options ${correctCount} (required 1)`);
    const optionUniq = new Set(question.options.map((o: any) => o.text?.trim().toLowerCase())).size;
    push('option_uniqueness', optionUniq === question.options.length, 'Options must be unique');

    push(
      'difficulty_range',
      question.difficulty >= 800 && question.difficulty <= 2400,
      `Difficulty ${question.difficulty} (expected 800-2400)`,
    );
    push(
      'solve_time_range',
      question.expectedSolveTimeSec >= 15 && question.expectedSolveTimeSec <= 600,
      `Expected solve time ${question.expectedSolveTimeSec}s (expected 15-600s)`,
    );
    push(
      'topic_mapping',
      question.topicMaps.length > 0,
      `Topic mappings ${question.topicMaps.length} (required >=1)`,
    );

    const generation = await this.prisma.questionGenerationRequest.findFirst({
      where: { tenantId, resultQuestionId: questionId },
      orderBy: { createdAt: 'desc' },
      select: {
        aiConfidence: true,
        hallucinationRisk: true,
        plagiarismScore: true,
        rubricCompliant: true,
      },
    });
    if (generation) {
      const conf = generation.aiConfidence ?? 0;
      const hall = generation.hallucinationRisk ?? 0;
      const plag = generation.plagiarismScore ?? 0;
      push('ai_confidence', conf >= 0.5, `AI confidence ${conf.toFixed(2)} (>=0.50)`);
      push('hallucination_risk', hall <= 0.5, `Hallucination risk ${hall.toFixed(2)} (<=0.50)`);
      push('plagiarism_score', plag <= 0.8, `Plagiarism score ${plag.toFixed(2)} (<=0.80)`);
      push(
        'generation_rubric_flag',
        generation.rubricCompliant !== false,
        `Generation rubric flag ${String(generation.rubricCompliant)}`,
      );
    }

    const failed = checks.filter((c) => !c.passed);
    const score = checks.length ? (checks.length - failed.length) / checks.length : 0;
    return {
      questionId,
      valid: failed.length === 0,
      score: Number(score.toFixed(3)),
      checks,
      issues: failed.map((f) => `${f.key}: ${f.details}`),
    };
  }
}
