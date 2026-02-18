import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EloService } from '../elo/elo.service';
import { AttemptStatus } from '@prisma/client';
import { NextBestActionEngine } from '../elo/next-best-action.engine';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elo: EloService,
    private readonly nextBestAction: NextBestActionEngine,
    private readonly aiService: AiService,
  ) {}

  async startDiagnostic(tenantId: string, studentId: string, payload: { topicIds: string[]; questionCount: number }) {
    const topicIds = Array.from(new Set(payload.topicIds));
    const targetCount = 10;

    const topicRatings = await this.prisma.studentTopicRating.findMany({
      where: { tenantId, studentId, topicId: { in: topicIds } },
    });
    const avg = topicRatings.length
      ? topicRatings.reduce((acc, r) => acc + r.rating, 0) / topicRatings.length
      : 1200;

    const recentAttempts = await this.prisma.attempt.findMany({
      where: {
        tenantId,
        studentId,
        isDiagnostic: true,
        status: AttemptStatus.SUBMITTED,
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      select: { assignedQuestionIds: true },
    });
    const usedQuestionIds = new Set(recentAttempts.flatMap((a) => a.assignedQuestionIds));

    let questions = await this.prisma.question.findMany({
      where: {
        tenantId,
        status: { in: ['APPROVED', 'PUBLISHED'] },
        topicMaps: { some: { topicId: { in: topicIds } } },
        difficulty: { gte: Math.floor(avg - 200), lte: Math.ceil(avg + 200) },
        id: { notIn: Array.from(usedQuestionIds) },
      },
      include: { options: true, topicMaps: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    // Fallback: if rating band is too narrow, use any approved/published question in selected topics.
    if (!questions.length) {
      questions = await this.prisma.question.findMany({
        where: {
          tenantId,
          status: { in: ['APPROVED', 'PUBLISHED'] },
          topicMaps: { some: { topicId: { in: topicIds } } },
          id: { notIn: Array.from(usedQuestionIds) },
        },
        include: { options: true, topicMaps: true },
        take: 200,
        orderBy: { createdAt: 'desc' },
      });
    }

    // If there are not enough unseen questions, refill from all eligible questions.
    if (questions.length < targetCount) {
      const fallbackAll = await this.prisma.question.findMany({
        where: {
          tenantId,
          status: { in: ['APPROVED', 'PUBLISHED'] },
          topicMaps: { some: { topicId: { in: topicIds } } },
        },
        include: { options: true, topicMaps: true },
        take: 300,
        orderBy: { createdAt: 'desc' },
      });
      const merged = new Map<string, (typeof fallbackAll)[number]>();
      [...questions, ...fallbackAll].forEach((q) => merged.set(q.id, q));
      questions = Array.from(merged.values());
    }

    if (!questions.length) {
      throw new BadRequestException(
        'No APPROVED/PUBLISHED questions found for selected topics. Ask teacher/admin to publish questions.',
      );
    }

    const randomized = [...questions].sort(() => Math.random() - 0.5);
    const selectedById = new Map<string, (typeof randomized)[number]>();

    // Try to cover all requested topics first (one question per topic when available).
    for (const topicId of topicIds) {
      const candidate = randomized.find(
        (q) => !selectedById.has(q.id) && q.topicMaps.some((map) => map.topicId === topicId),
      );
      if (candidate) selectedById.set(candidate.id, candidate);
    }

    // Fill remaining slots.
    for (const q of randomized) {
      if (selectedById.size >= targetCount) break;
      if (!selectedById.has(q.id)) selectedById.set(q.id, q);
    }

    const selectedQuestions = Array.from(selectedById.values()).slice(0, targetCount);
    const assignedQuestionIds = selectedQuestions.map((q) => q.id);
    const attempt = await this.prisma.attempt.create({
      data: {
        tenantId,
        studentId,
        isDiagnostic: true,
        status: AttemptStatus.IN_PROGRESS,
        assignedQuestionIds,
        totalQuestions: selectedQuestions.length,
      },
    });

    return {
      attemptId: attempt.id,
      questions: selectedQuestions.map((q) => ({
        id: q.id,
        stem: q.stem,
        expectedSolveTimeSec: q.expectedSolveTimeSec,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
    };
  }

  async submitAttempt(
    tenantId: string,
    studentId: string,
    attemptId: string,
    payload: { answers: { questionId: string; selectedOptionId: string; timeSpentSec: number; confidence?: number }[] },
  ) {
    const attempt = await this.prisma.attempt.findFirst({ where: { id: attemptId, tenantId, studentId } });
    if (!attempt) throw new BadRequestException('Attempt not found');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is already closed');
    }

    const uniqueQuestionIds = new Set(payload.answers.map((a) => a.questionId));
    if (uniqueQuestionIds.size !== payload.answers.length) {
      throw new BadRequestException('Duplicate answers for same question are not allowed');
    }

    const assignedSet = new Set(attempt.assignedQuestionIds);
    for (const answer of payload.answers) {
      if (!assignedSet.has(answer.questionId)) {
        throw new BadRequestException(`Question ${answer.questionId} is not part of this attempt`);
      }
    }

    let correctCount = 0;
    const history: any[] = [];
    const questionResults: Array<{ questionId: string; isCorrect: boolean; timeSpentSec: number }> = [];

    for (const answer of payload.answers) {
      const q = await this.prisma.question.findFirst({
        where: { id: answer.questionId, tenantId },
        include: { options: true, topicMaps: true },
      });
      if (!q) continue;

      const selectedOption = q.options.find((opt) => opt.id === answer.selectedOptionId);
      if (!selectedOption) {
        throw new BadRequestException(`Invalid option for question ${q.id}`);
      }

      const isCorrect = selectedOption.isCorrect;
      if (isCorrect) correctCount++;

      await this.prisma.attemptAnswer.upsert({
        where: {
          tenantId_attemptId_questionId: {
            tenantId,
            attemptId,
            questionId: q.id,
          },
        },
        create: {
          tenantId,
          attemptId,
          questionId: q.id,
          selectedOptionId: answer.selectedOptionId,
          isCorrect,
          timeSpentSec: answer.timeSpentSec,
          confidence: answer.confidence,
        },
        update: {
          selectedOptionId: answer.selectedOptionId,
          isCorrect,
          timeSpentSec: answer.timeSpentSec,
          confidence: answer.confidence,
        },
      });
      questionResults.push({ questionId: q.id, isCorrect, timeSpentSec: answer.timeSpentSec });

      if (!isCorrect) {
        const primaryTopic = q.topicMaps[0];
        const correctOption = q.options.find((opt) => opt.isCorrect);
        if (primaryTopic && correctOption) {
          const existingCard = await this.prisma.flashcard.findFirst({
            where: { tenantId, studentId, sourceQuestionId: q.id },
          });
          if (existingCard) {
            await this.prisma.flashcard.update({
              where: { id: existingCard.id },
              data: {
                topicId: primaryTopic.topicId,
                prompt: q.stem,
                answer: correctOption.text,
                correctValue: correctOption.text,
                explanation: q.explanation,
                repetition: 0,
                intervalDays: 1,
                nextReviewAt: new Date(),
              },
            });
          } else {
            await this.prisma.flashcard.create({
              data: {
                tenantId,
                studentId,
                topicId: primaryTopic.topicId,
                sourceQuestionId: q.id,
                prompt: q.stem,
                answer: correctOption.text,
                correctValue: correctOption.text,
                explanation: q.explanation,
                nextReviewAt: new Date(),
              },
            });
          }
        }
      }

      for (const map of q.topicMaps) {
        const st = await this.prisma.studentTopicRating.upsert({
          where: { tenantId_studentId_topicId: { tenantId, studentId, topicId: map.topicId } },
          create: {
            tenantId,
            studentId,
            topicId: map.topicId,
            rating: 1200,
            ratingDeviation: 350,
            speedIndex: 1,
            retentionIndex: 1,
            gamesPlayed: 0,
          },
          update: {},
        });

        const qt = await this.prisma.questionTopicRating.upsert({
          where: { tenantId_questionId_topicId: { tenantId, questionId: q.id, topicId: map.topicId } },
          create: {
            tenantId,
            questionId: q.id,
            topicId: map.topicId,
            rating: 1200,
            ratingDeviation: 350,
            gamesPlayed: 0,
          },
          update: {},
        });

        const updated = this.elo.updateV2({
          studentRating: st.rating,
          questionRating: qt.rating,
          studentDeviation: st.ratingDeviation,
          questionDeviation: qt.ratingDeviation,
          speedIndex: st.speedIndex,
          retentionIndex: st.retentionIndex,
          correct: isCorrect,
          timeSpentSec: answer.timeSpentSec,
          expectedSolveTimeSec: q.expectedSolveTimeSec,
        });

        await this.prisma.studentTopicRating.update({
          where: { tenantId_studentId_topicId: { tenantId, studentId, topicId: map.topicId } },
          data: {
            rating: updated.newStudentRating,
            ratingDeviation: updated.newStudentDeviation,
            speedIndex: updated.newSpeedIndex,
            retentionIndex: updated.newRetentionIndex,
            gamesPlayed: { increment: 1 },
          },
        });

        await this.prisma.questionTopicRating.update({
          where: { tenantId_questionId_topicId: { tenantId, questionId: q.id, topicId: map.topicId } },
          data: {
            rating: updated.newQuestionRating,
            ratingDeviation: updated.newQuestionDeviation,
            gamesPlayed: { increment: 1 },
          },
        });

        await this.prisma.ratingHistory.create({
          data: {
            tenantId,
            studentId,
            topicId: map.topicId,
            questionId: q.id,
            oldStudentRating: updated.oldStudentRating,
            newStudentRating: updated.newStudentRating,
            oldQuestionRating: updated.oldQuestionRating,
            newQuestionRating: updated.newQuestionRating,
            deltaStudent: updated.deltaStudent,
            deltaQuestion: updated.deltaQuestion,
            speedDelta: updated.speedDelta,
            retentionDelta: updated.retentionDelta,
            correct: isCorrect,
            timeSpentSec: answer.timeSpentSec,
          },
        });

        history.push({ topicId: map.topicId, ...updated, correct: isCorrect });
      }
    }

    const totalQuestions = attempt.assignedQuestionIds.length;
    const totalScore = totalQuestions ? correctCount / totalQuestions : 0;

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        submittedAt: new Date(),
        status: AttemptStatus.SUBMITTED,
        totalScore,
        totalQuestions,
      },
    });

    const lowestTopics = await this.prisma.studentTopicRating.findMany({
      where: { tenantId, studentId },
      orderBy: { rating: 'asc' },
      take: 3,
      include: { topic: true },
    });
    const action = await this.nextBestAction.recommend(tenantId, studentId);
    const avgTimeRatio =
      questionResults.length > 0
        ? questionResults.reduce((acc, r) => acc + (r.timeSpentSec > 0 ? 1 / Math.max(0.5, r.timeSpentSec / 60) : 1), 0) /
          questionResults.length
        : 1;
    const strengths = await this.prisma.studentTopicRating.findMany({
      where: { tenantId, studentId },
      orderBy: { rating: 'desc' },
      include: { topic: true },
      take: 3,
    });
    const aiAnalysis = await this.aiService.analyzeDiagnosticAttempt({
      tenantId,
      accuracy: totalScore,
      averageTimeRatio: avgTimeRatio,
      weakTopics: lowestTopics.map((t) => t.topic.name),
      weakTopicIds: lowestTopics.map((t) => t.topicId),
      strengths: strengths.map((t) => t.topic.name),
      nextBestAction: action.recommendedBlockType,
    });

    return {
      attemptId,
      status: AttemptStatus.SUBMITTED,
      totalScore,
      correctCount,
      totalQuestions,
      answeredQuestions: payload.answers.length,
      unansweredQuestions: Math.max(0, totalQuestions - payload.answers.length),
      questionResults,
      ratingUpdates: history,
      nextRecommendedTopics: lowestTopics.map((t) => ({ topicId: t.topicId, topicName: t.topic.name })),
      nextBestAction: action,
      aiAnalysis,
    };
  }

  async studentDashboard(tenantId: string, studentId: string) {
    const mastery = await this.prisma.studentTopicRating.findMany({
      where: { tenantId, studentId },
      include: { topic: true },
      orderBy: { updatedAt: 'desc' },
    });

    const trends = await this.prisma.ratingHistory.findMany({
      where: { tenantId, studentId },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });
    const action = await this.nextBestAction.recommend(tenantId, studentId);

    return {
      mastery: mastery.map((m) => ({
        topicId: m.topicId,
        topicName: m.topic.name,
        rating: m.rating,
        ratingDeviation: m.ratingDeviation,
        speedIndex: m.speedIndex,
        retentionIndex: m.retentionIndex,
      })),
      trends: trends.map((t) => ({ topicId: t.topicId, at: t.createdAt, rating: t.newStudentRating })),
      nextBestAction: action,
    };
  }

  async getAttempt(tenantId: string, studentId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, tenantId, studentId },
      include: {
        answers: true,
      },
    });
    if (!attempt) {
      throw new BadRequestException('Attempt not found');
    }

    const questions = await this.prisma.question.findMany({
      where: {
        tenantId,
        id: { in: attempt.assignedQuestionIds },
      },
      include: { options: true },
    });

    const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));
    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      totalScore: attempt.totalScore,
      totalQuestions: attempt.totalQuestions,
      questions: questions.map((q) => ({
        id: q.id,
        stem: q.stem,
        expectedSolveTimeSec: q.expectedSolveTimeSec,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        answer: answerMap.get(q.id)
          ? {
              selectedOptionId: answerMap.get(q.id)?.selectedOptionId,
              isCorrect: answerMap.get(q.id)?.isCorrect,
              timeSpentSec: answerMap.get(q.id)?.timeSpentSec,
            }
          : null,
      })),
    };
  }

  async nextBestActionForStudent(tenantId: string, studentId: string) {
    return this.nextBestAction.recommend(tenantId, studentId);
  }

  async diagnosticAnalysis(tenantId: string, studentId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, tenantId, studentId },
      include: {
        answers: {
          include: {
            question: {
              include: { topicMaps: { include: { topic: true } } },
            },
          },
        },
      },
    });
    if (!attempt) throw new BadRequestException('Attempt not found');
    if (!attempt.answers.length) throw new BadRequestException('Attempt has no submitted answers');

    const correctCount = attempt.answers.filter((a) => a.isCorrect).length;
    const accuracy = correctCount / attempt.answers.length;
    const avgTimeRatio =
      attempt.answers.reduce((acc, a) => acc + a.question.expectedSolveTimeSec / Math.max(1, a.timeSpentSec), 0) /
      attempt.answers.length;

    const perTopic = new Map<string, { name: string; total: number; correct: number }>();
    for (const ans of attempt.answers) {
      for (const map of ans.question.topicMaps) {
        const curr = perTopic.get(map.topicId) || { name: map.topic.name, total: 0, correct: 0 };
        curr.total += 1;
        if (ans.isCorrect) curr.correct += 1;
        perTopic.set(map.topicId, curr);
      }
    }
    const stats = Array.from(perTopic.values()).map((t) => ({
      topicName: t.name,
      accuracy: t.total ? t.correct / t.total : 0,
    }));
    const weakTopics = stats
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map((s) => s.topicName);
    const strengths = [...stats]
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 2)
      .map((s) => s.topicName);

    const action = await this.nextBestAction.recommend(tenantId, studentId);
    return this.aiService.analyzeDiagnosticAttempt({
      tenantId,
      accuracy,
      averageTimeRatio: avgTimeRatio,
      weakTopics,
      weakTopicIds: [],
      strengths,
      nextBestAction: action.recommendedBlockType,
    });
  }
}
