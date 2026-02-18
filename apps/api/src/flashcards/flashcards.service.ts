import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FlashcardsService implements OnModuleInit, OnModuleDestroy {
  private decayTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const intervalMs = Number(process.env.RETENTION_DECAY_INTERVAL_MS || 30 * 60 * 1000);
    this.decayTimer = setInterval(() => {
      void this.recalculateRetentionDecay();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.decayTimer) clearInterval(this.decayTimer);
  }

  async due(tenantId: string, studentId: string) {
    const cards = await this.prisma.flashcard.findMany({
      where: { tenantId, studentId, nextReviewAt: { lte: new Date() } },
      include: { topic: true },
      orderBy: { nextReviewAt: 'asc' },
      take: 25,
    });

    const sourceQuestionIds = Array.from(
      new Set(cards.filter((c) => c.sourceQuestionId).map((c) => c.sourceQuestionId as string)),
    );
    const sourceQuestions = sourceQuestionIds.length
      ? await this.prisma.question.findMany({
          where: { tenantId, id: { in: sourceQuestionIds } },
          include: { options: true },
        })
      : [];
    const questionMap = new Map(sourceQuestions.map((q) => [q.id, q]));

    // Backfill missing explanation/correct value for existing cards.
    for (const card of cards) {
      if ((card.explanation && card.correctValue) || !card.sourceQuestionId) continue;
      const question = questionMap.get(card.sourceQuestionId);
      if (!question) continue;
      const correctOption = question.options.find((o) => o.isCorrect);
      const explanation =
        card.explanation || question.explanation || (correctOption ? `Correct value is ${correctOption.text}.` : null);
      const correctValue = card.correctValue || correctOption?.text || card.answer;
      await this.prisma.flashcard.update({
        where: { id: card.id },
        data: { explanation, correctValue },
      });
      card.explanation = explanation;
      card.correctValue = correctValue;
    }

    const interleaved = this.interleaveByTopic(cards);
    return interleaved.map((c) => ({
      ...c,
      explanation: c.explanation || `Correct value is ${c.correctValue || c.answer}.`,
      correctValue: c.correctValue || c.answer,
      retentionEstimate: this.retentionEstimate(c),
    }));
  }

  async review(tenantId: string, studentId: string, flashcardId: string, quality: number) {
    const card = await this.prisma.flashcard.findFirst({ where: { id: flashcardId, tenantId, studentId } });
    if (!card) return null;

    const next = this.sm2Plus({
      repetition: card.repetition,
      intervalDays: card.intervalDays,
      ef: card.easinessFactor,
      quality,
      stability: card.stability,
      difficulty: card.difficultyScore,
      lapseCount: card.lapseCount,
    });
    const nextReviewAt = new Date(Date.now() + next.intervalDays * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.flashcard.update({
      where: { id: card.id },
      data: {
        repetition: next.repetition,
        intervalDays: next.intervalDays,
        easinessFactor: next.easinessFactor,
        stability: next.stability,
        difficultyScore: next.difficultyScore,
        lapseCount: next.lapseCount,
        retentionScore: next.retentionScore,
        lastReviewedAt: new Date(),
        nextReviewAt,
      },
    });

    await this.prisma.flashcardReview.create({
      data: {
        tenantId,
        flashcardId,
        studentId,
        quality,
        nextReviewAt,
      },
    });

    await this.prisma.studentTopicRating.updateMany({
      where: { tenantId, studentId, topicId: card.topicId },
      data: {
        retentionIndex: quality >= 3 ? { increment: 0.02 } : { decrement: 0.04 },
      },
    });

    return updated;
  }

  sm2Plus(params: {
    repetition: number;
    intervalDays: number;
    ef: number;
    quality: number;
    stability: number;
    difficulty: number;
    lapseCount: number;
  }) {
    const { repetition, intervalDays, ef, quality } = params;
    let nextEf = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (nextEf < 1.3) nextEf = 1.3;

    if (quality < 3) {
      return {
        repetition: 0,
        intervalDays: 1,
        easinessFactor: nextEf,
        stability: Math.max(0.6, params.stability * 0.8),
        difficultyScore: Math.min(1, params.difficulty + 0.05),
        lapseCount: params.lapseCount + 1,
        retentionScore: Math.max(0.2, params.stability * 0.8),
      };
    }

    const nextRepetition = repetition + 1;
    let nextInterval = 1;
    if (nextRepetition === 1) nextInterval = 1;
    if (nextRepetition === 2) nextInterval = 6;
    if (nextRepetition > 2) nextInterval = Math.round(intervalDays * nextEf);

    const stability = Math.min(10, params.stability + 0.25 + quality * 0.05);
    const difficultyScore = Math.max(0.1, params.difficulty - 0.02);
    const retentionScore = this.clamp(Math.exp(-1 / Math.max(1, nextInterval / stability)), 0.2, 1);

    return {
      repetition: nextRepetition,
      intervalDays: nextInterval,
      easinessFactor: nextEf,
      stability,
      difficultyScore,
      lapseCount: params.lapseCount,
      retentionScore,
    };
  }

  private retentionEstimate(card: { lastReviewedAt: Date | null; intervalDays: number; stability: number }) {
    const anchor = card.lastReviewedAt ? card.lastReviewedAt.getTime() : Date.now();
    const elapsedDays = Math.max(0, (Date.now() - anchor) / (24 * 60 * 60 * 1000));
    const baseInterval = Math.max(1, card.intervalDays * Math.max(0.5, card.stability));
    return this.clamp(Math.exp(-elapsedDays / baseInterval), 0, 1);
  }

  private interleaveByTopic<T extends { topicId: string }>(cards: T[]) {
    const buckets = new Map<string, T[]>();
    cards.forEach((card) => {
      if (!buckets.has(card.topicId)) buckets.set(card.topicId, []);
      buckets.get(card.topicId)!.push(card);
    });

    const result: T[] = [];
    const keys = Array.from(buckets.keys());
    let index = 0;
    while (result.length < cards.length) {
      const key = keys[index % keys.length];
      const bucket = buckets.get(key)!;
      if (bucket.length > 0) {
        result.push(bucket.shift() as T);
      }
      index++;
    }
    return result;
  }

  private async recalculateRetentionDecay() {
    const ratings = await this.prisma.studentTopicRating.findMany({
      where: { retentionIndex: { gt: 0.2 } },
      take: 1000,
    });
    const now = Date.now();
    for (const rating of ratings) {
      const days = Math.max(0, (now - rating.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      const decayed = this.clamp(rating.retentionIndex - days * 0.003, 0.2, 1.2);
      if (Math.abs(decayed - rating.retentionIndex) > 0.001) {
        await this.prisma.studentTopicRating.update({
          where: { tenantId_studentId_topicId: { tenantId: rating.tenantId, studentId: rating.studentId, topicId: rating.topicId } },
          data: { retentionIndex: decayed },
        });
      }
    }
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
