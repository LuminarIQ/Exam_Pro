-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_studentId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAnswer" DROP CONSTRAINT "AttemptAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "Chapter" DROP CONSTRAINT "Chapter_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Flashcard" DROP CONSTRAINT "Flashcard_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Flashcard" DROP CONSTRAINT "Flashcard_topicId_fkey";

-- DropForeignKey
ALTER TABLE "FlashcardReview" DROP CONSTRAINT "FlashcardReview_flashcardId_fkey";

-- DropForeignKey
ALTER TABLE "FlashcardReview" DROP CONSTRAINT "FlashcardReview_studentId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPlanItem" DROP CONSTRAINT "LearningPlanItem_learningPlanId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionOption" DROP CONSTRAINT "QuestionOption_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTag" DROP CONSTRAINT "QuestionTag_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTopicMap" DROP CONSTRAINT "QuestionTopicMap_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTopicMap" DROP CONSTRAINT "QuestionTopicMap_topicId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTopicRating" DROP CONSTRAINT "QuestionTopicRating_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionTopicRating" DROP CONSTRAINT "QuestionTopicRating_topicId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "StudentTopicRating" DROP CONSTRAINT "StudentTopicRating_studentId_fkey";

-- DropForeignKey
ALTER TABLE "StudentTopicRating" DROP CONSTRAINT "StudentTopicRating_topicId_fkey";

-- DropForeignKey
ALTER TABLE "Topic" DROP CONSTRAINT "Topic_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "TopicPrerequisite" DROP CONSTRAINT "TopicPrerequisite_prerequisiteTopicId_fkey";

-- DropForeignKey
ALTER TABLE "TopicPrerequisite" DROP CONSTRAINT "TopicPrerequisite_topicId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- AlterTable
ALTER TABLE "Attempt" ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AttemptAnswer" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Chapter" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Enrollment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Flashcard" ALTER COLUMN "nextReviewAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FlashcardReview" ALTER COLUMN "reviewedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "nextReviewAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LearningPlan" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuestionGenerationRequest" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuestionTopicRating" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RatingHistory" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentTopicRating" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subject" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Topic" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Attempt_tenantId_studentId_idx" ON "Attempt"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_tenantId_attemptId_idx" ON "AttemptAnswer"("tenantId", "attemptId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Chapter_tenantId_subjectId_idx" ON "Chapter"("tenantId", "subjectId");

-- CreateIndex
CREATE INDEX "Flashcard_tenantId_studentId_nextReviewAt_idx" ON "Flashcard"("tenantId", "studentId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "FlashcardReview_tenantId_studentId_reviewedAt_idx" ON "FlashcardReview"("tenantId", "studentId", "reviewedAt");

-- CreateIndex
CREATE INDEX "LearningPlan_tenantId_studentId_idx" ON "LearningPlan"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "LearningPlanItem_tenantId_learningPlanId_idx" ON "LearningPlanItem"("tenantId", "learningPlanId");

-- CreateIndex
CREATE INDEX "Question_tenantId_status_idx" ON "Question"("tenantId", "status");

-- CreateIndex
CREATE INDEX "QuestionOption_tenantId_questionId_idx" ON "QuestionOption"("tenantId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionTag_tenantId_questionId_idx" ON "QuestionTag"("tenantId", "questionId");

-- CreateIndex
CREATE INDEX "RatingHistory_tenantId_studentId_topicId_createdAt_idx" ON "RatingHistory"("tenantId", "studentId", "topicId", "createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_tenantId_userId_idx" ON "RefreshToken"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Topic_tenantId_chapterId_idx" ON "Topic"("tenantId", "chapterId");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPrerequisite" ADD CONSTRAINT "TopicPrerequisite_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPrerequisite" ADD CONSTRAINT "TopicPrerequisite_prerequisiteTopicId_fkey" FOREIGN KEY ("prerequisiteTopicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopicMap" ADD CONSTRAINT "QuestionTopicMap_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopicMap" ADD CONSTRAINT "QuestionTopicMap_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTopicRating" ADD CONSTRAINT "StudentTopicRating_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTopicRating" ADD CONSTRAINT "StudentTopicRating_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopicRating" ADD CONSTRAINT "QuestionTopicRating_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopicRating" ADD CONSTRAINT "QuestionTopicRating_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlanItem" ADD CONSTRAINT "LearningPlanItem_learningPlanId_fkey" FOREIGN KEY ("learningPlanId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
