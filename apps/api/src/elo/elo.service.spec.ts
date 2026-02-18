import { EloService } from './elo.service';

describe('EloService', () => {
  const svc = new EloService();

  it('raises student rating on correct answer', () => {
    const out = svc.update(1200, 1200, true);
    expect(out.newStudentRating).toBeGreaterThan(1200);
    expect(out.newQuestionRating).toBeLessThan(1200);
  });

  it('reduces student rating on incorrect answer', () => {
    const out = svc.update(1200, 1200, false);
    expect(out.newStudentRating).toBeLessThan(1200);
    expect(out.newQuestionRating).toBeGreaterThan(1200);
  });

  it('updates deviation speed and retention in v2', () => {
    const out = svc.updateV2({
      studentRating: 1200,
      questionRating: 1200,
      studentDeviation: 300,
      questionDeviation: 300,
      speedIndex: 1,
      retentionIndex: 1,
      correct: true,
      timeSpentSec: 40,
      expectedSolveTimeSec: 60,
    });
    expect(out.newStudentDeviation).toBeLessThanOrEqual(350);
    expect(out.newSpeedIndex).toBeGreaterThan(1);
    expect(out.newRetentionIndex).toBeGreaterThan(1);
  });
});
