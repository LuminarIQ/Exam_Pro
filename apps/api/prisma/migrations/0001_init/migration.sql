-- Initial schema for Adaptive Tutor MVP
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'AI');
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'GENERATED', 'FAILED');

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "email")
);

CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "revokedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Subject" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "name")
);

CREATE TABLE "Chapter" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL REFERENCES "Subject"("id"),
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "subjectId", "name")
);

CREATE TABLE "Topic" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL REFERENCES "Chapter"("id"),
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "chapterId", "name")
);

CREATE TABLE "TopicPrerequisite" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  "prerequisiteTopicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  UNIQUE ("tenantId", "topicId", "prerequisiteTopicId")
);

CREATE TABLE "Question" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "stem" TEXT NOT NULL,
  "explanation" TEXT,
  "expectedSolveTimeSec" INTEGER NOT NULL DEFAULT 60,
  "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
  "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
  "difficulty" INTEGER NOT NULL DEFAULT 1200,
  "createdById" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "QuestionOption" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL REFERENCES "Question"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "QuestionTag" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL REFERENCES "Question"("id") ON DELETE CASCADE,
  "tag" TEXT NOT NULL
);

CREATE TABLE "QuestionTopicMap" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL REFERENCES "Question"("id") ON DELETE CASCADE,
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  UNIQUE ("tenantId", "questionId", "topicId")
);

CREATE TABLE "QuestionGenerationRequest" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "jobId" TEXT,
  "resultQuestionId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Attempt" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL REFERENCES "User"("id"),
  "isDiagnostic" BOOLEAN NOT NULL DEFAULT TRUE,
  "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP,
  "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalQuestions" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "AttemptAnswer" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL REFERENCES "Attempt"("id") ON DELETE CASCADE,
  "questionId" TEXT NOT NULL REFERENCES "Question"("id"),
  "selectedOptionId" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT FALSE,
  "timeSpentSec" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "StudentTopicRating" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL REFERENCES "User"("id"),
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 1200,
  "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "studentId", "topicId")
);

CREATE TABLE "QuestionTopicRating" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL REFERENCES "Question"("id"),
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 1200,
  "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "questionId", "topicId")
);

CREATE TABLE "RatingHistory" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "oldStudentRating" DOUBLE PRECISION NOT NULL,
  "newStudentRating" DOUBLE PRECISION NOT NULL,
  "oldQuestionRating" DOUBLE PRECISION NOT NULL,
  "newQuestionRating" DOUBLE PRECISION NOT NULL,
  "deltaStudent" DOUBLE PRECISION NOT NULL,
  "deltaQuestion" DOUBLE PRECISION NOT NULL,
  "correct" BOOLEAN NOT NULL,
  "timeSpentSec" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Flashcard" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL REFERENCES "User"("id"),
  "topicId" TEXT NOT NULL REFERENCES "Topic"("id"),
  "prompt" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "repetition" INTEGER NOT NULL DEFAULT 0,
  "intervalDays" INTEGER NOT NULL DEFAULT 1,
  "easinessFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  "nextReviewAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FlashcardReview" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "flashcardId" TEXT NOT NULL REFERENCES "Flashcard"("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "User"("id"),
  "quality" INTEGER NOT NULL,
  "reviewedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextReviewAt" TIMESTAMP NOT NULL
);

CREATE TABLE "LearningPlan" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LearningPlanItem" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "learningPlanId" TEXT NOT NULL REFERENCES "LearningPlan"("id") ON DELETE CASCADE,
  "topicId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE "Enrollment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL REFERENCES "User"("id"),
  "subjectId" TEXT NOT NULL REFERENCES "Subject"("id"),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "studentId", "subjectId")
);

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
