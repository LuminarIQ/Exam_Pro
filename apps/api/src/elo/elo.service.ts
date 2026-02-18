import { Injectable } from '@nestjs/common';

@Injectable()
export class EloService {
  studentK = Number(process.env.STUDENT_ELO_K || 32);
  questionK = Number(process.env.QUESTION_ELO_K || 16);

  expectedScore(ra: number, rb: number) {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
  }

  update(studentRating: number, questionRating: number, correct: boolean) {
    const s = correct ? 1 : 0;
    const expectedStudent = this.expectedScore(studentRating, questionRating);
    const studentNext = studentRating + this.studentK * (s - expectedStudent);

    const questionOutcome = correct ? 0 : 1;
    const expectedQuestion = this.expectedScore(questionRating, studentRating);
    const questionNext = questionRating + this.questionK * (questionOutcome - expectedQuestion);

    return {
      oldStudentRating: studentRating,
      newStudentRating: studentNext,
      oldQuestionRating: questionRating,
      newQuestionRating: questionNext,
      deltaStudent: studentNext - studentRating,
      deltaQuestion: questionNext - questionRating,
    };
  }

  updateV2(params: {
    studentRating: number;
    questionRating: number;
    studentDeviation: number;
    questionDeviation: number;
    speedIndex: number;
    retentionIndex: number;
    correct: boolean;
    timeSpentSec: number;
    expectedSolveTimeSec: number;
  }) {
    const base = this.update(params.studentRating, params.questionRating, params.correct);
    const expected = this.expectedScore(params.studentRating, params.questionRating);
    const actual = params.correct ? 1 : 0;

    const uncertainty = Math.abs(actual - expected);
    const newStudentDeviation = this.clamp(params.studentDeviation * 0.96 + uncertainty * 18, 60, 350);
    const newQuestionDeviation = this.clamp(params.questionDeviation * 0.98 + uncertainty * 10, 60, 350);

    const expectedTime = Math.max(1, params.expectedSolveTimeSec);
    const speedRatio = expectedTime / Math.max(1, params.timeSpentSec);
    const speedDelta = this.clamp((speedRatio - 1) * 0.08, -0.12, 0.12);
    const retentionDelta = params.correct ? 0.03 : -0.06;

    const newSpeedIndex = this.clamp(params.speedIndex + speedDelta, 0.5, 1.5);
    const newRetentionIndex = this.clamp(params.retentionIndex + retentionDelta, 0.2, 1.2);

    return {
      ...base,
      oldStudentDeviation: params.studentDeviation,
      newStudentDeviation,
      oldQuestionDeviation: params.questionDeviation,
      newQuestionDeviation,
      oldSpeedIndex: params.speedIndex,
      newSpeedIndex,
      speedDelta: newSpeedIndex - params.speedIndex,
      oldRetentionIndex: params.retentionIndex,
      newRetentionIndex,
      retentionDelta: newRetentionIndex - params.retentionIndex,
    };
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
