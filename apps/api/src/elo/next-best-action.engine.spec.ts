import { NextBestActionEngine } from './next-best-action.engine';

describe('NextBestActionEngine', () => {
  const baseRating = {
    topicId: 't1',
    rating: 1100,
    ratingDeviation: 200,
    speedIndex: 0.95,
    retentionIndex: 0.8,
    topic: { name: 'Linear', prerequisites: [] },
  };

  it('returns revision session for low retention', async () => {
    const prisma: any = {
      studentTopicRating: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...baseRating,
            retentionIndex: 0.6,
          },
        ]),
      },
      ratingHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const engine = new NextBestActionEngine(prisma);
    const out = await engine.recommend('public', 'student-1');
    expect(out.recommendedBlockType).toBe('REVISION_SESSION');
    expect(out.topics.length).toBeGreaterThan(0);
  });

  it('returns high-intensity reinforcement on negative trend', async () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => ({ correct: i < 2 })),
      ...Array.from({ length: 10 }, (_, i) => ({ correct: i < 8 })),
    ];
    const prisma: any = {
      studentTopicRating: {
        findMany: jest.fn().mockResolvedValue([{ ...baseRating }]),
      },
      ratingHistory: {
        findMany: jest.fn().mockResolvedValue(history),
      },
    };

    const engine = new NextBestActionEngine(prisma);
    const out = await engine.recommend('public', 'student-1');
    expect(out.recommendedBlockType).toBe('PRACTICE_REINFORCEMENT');
    expect(out.intensity).toBe('high');
  });

  it('returns conceptual block when student is fast but weak', async () => {
    const prisma: any = {
      studentTopicRating: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...baseRating,
            rating: 980,
            speedIndex: 1.22,
            retentionIndex: 0.9,
          },
        ]),
      },
      ratingHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const engine = new NextBestActionEngine(prisma);
    const out = await engine.recommend('public', 'student-1');
    expect(out.recommendedBlockType).toBe('CONCEPTUAL_BLOCK');
  });
});
