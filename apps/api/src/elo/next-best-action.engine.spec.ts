import { NextBestActionEngine } from './next-best-action.engine';

describe('NextBestActionEngine', () => {
  it('returns revision session for low retention', async () => {
    const prisma: any = {
      studentTopicRating: {
        findMany: jest.fn().mockResolvedValue([
          {
            topicId: 't1',
            rating: 1100,
            speedIndex: 0.95,
            retentionIndex: 0.6,
            topic: { name: 'Linear', prerequisites: [] },
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
});
