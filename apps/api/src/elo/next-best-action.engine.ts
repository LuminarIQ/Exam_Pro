import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BlockType =
  | 'RAISE_DIFFICULTY'
  | 'CONCEPTUAL_BLOCK'
  | 'TIMED_DRILL'
  | 'REVISION_SESSION'
  | 'PREREQUISITE_BACKTRACK'
  | 'PRACTICE_REINFORCEMENT';

@Injectable()
export class NextBestActionEngine {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(tenantId: string, studentId: string) {
    const [ratings, recentHistory] = await Promise.all([
      this.prisma.studentTopicRating.findMany({
        where: { tenantId, studentId },
        include: { topic: { include: { prerequisites: true } } },
        orderBy: { rating: 'asc' },
      }),
      this.prisma.ratingHistory.findMany({
        where: { tenantId, studentId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    if (!ratings.length) {
      return {
        recommendedBlockType: 'PRACTICE_REINFORCEMENT' as BlockType,
        topics: [],
        intensity: 'low',
        reason: 'No historical data yet. Start with baseline reinforcement.',
      };
    }

    const avgAccuracy = recentHistory.length
      ? recentHistory.filter((h) => h.correct).length / recentHistory.length
      : 0.5;
    const weakest = ratings.slice(0, 3);
    const lowRetention = ratings.filter((r) => r.retentionIndex < 0.75).slice(0, 3);
    const slowButCorrect = ratings.filter((r) => r.speedIndex < 0.85 && r.rating >= 1150).slice(0, 3);
    const fastButWeak = ratings.filter((r) => r.speedIndex > 1.1 && r.rating < 1100).slice(0, 3);

    const byTopicId = new Map(ratings.map((r) => [r.topicId, r]));
    const prerequisiteGap = ratings.find((r) =>
      r.topic.prerequisites.some((p) => {
        const pre = byTopicId.get(p.prerequisiteTopicId);
        return pre && pre.rating + 120 < r.rating;
      }),
    );

    if (lowRetention.length > 0) {
      return {
        recommendedBlockType: 'REVISION_SESSION' as BlockType,
        topics: lowRetention.map((r) => ({ topicId: r.topicId, topicName: r.topic.name })),
        intensity: 'medium',
        reason: 'Retention drop detected. Schedule spaced revision for at-risk topics.',
      };
    }

    if (prerequisiteGap) {
      const prereqIds = prerequisiteGap.topic.prerequisites.map((p) => p.prerequisiteTopicId);
      const prereqTopics = ratings
        .filter((r) => prereqIds.includes(r.topicId))
        .slice(0, 3)
        .map((r) => ({ topicId: r.topicId, topicName: r.topic.name }));
      return {
        recommendedBlockType: 'PREREQUISITE_BACKTRACK' as BlockType,
        topics: prereqTopics,
        intensity: 'high',
        reason: 'Prerequisite mastery gap found. Backtrack before progressing.',
      };
    }

    if (fastButWeak.length > 0) {
      return {
        recommendedBlockType: 'CONCEPTUAL_BLOCK' as BlockType,
        topics: fastButWeak.map((r) => ({ topicId: r.topicId, topicName: r.topic.name })),
        intensity: 'high',
        reason: 'Student is fast but inaccurate. Needs conceptual correction blocks.',
      };
    }

    if (slowButCorrect.length > 0) {
      return {
        recommendedBlockType: 'TIMED_DRILL' as BlockType,
        topics: slowButCorrect.map((r) => ({ topicId: r.topicId, topicName: r.topic.name })),
        intensity: 'medium',
        reason: 'Student is accurate but slow. Recommend timed drills.',
      };
    }

    const minRating = Math.min(...ratings.map((r) => r.rating));
    if (avgAccuracy >= 0.75 && minRating >= 1250) {
      return {
        recommendedBlockType: 'RAISE_DIFFICULTY' as BlockType,
        topics: weakest.map((r) => ({ topicId: r.topicId, topicName: r.topic.name })),
        intensity: 'medium',
        reason: 'Stable strong performance. Increase challenge level.',
      };
    }

    return {
      recommendedBlockType: 'PRACTICE_REINFORCEMENT' as BlockType,
      topics: weakest.map((r) => ({ topicId: r.topicId, topicName: r.topic.name })),
      intensity: avgAccuracy < 0.5 ? 'high' : 'low',
      reason: 'Continue reinforcement on lowest mastery topics.',
    };
  }
}
