-- DB-level tenant integrity constraints via composite unique keys and FKs
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Subject" ADD CONSTRAINT "Subject_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Topic" ADD CONSTRAINT "Topic_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Question" ADD CONSTRAINT "Question_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_id_tenantId_unique" UNIQUE ("id", "tenantId");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_subject_tenant_fk"
    FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Topic" ADD CONSTRAINT "Topic_chapter_tenant_fk"
    FOREIGN KEY ("chapterId", "tenantId") REFERENCES "Chapter"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_question_tenant_fk"
    FOREIGN KEY ("questionId", "tenantId") REFERENCES "Question"("id", "tenantId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionTopicMap" ADD CONSTRAINT "QuestionTopicMap_question_tenant_fk"
    FOREIGN KEY ("questionId", "tenantId") REFERENCES "Question"("id", "tenantId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionTopicMap" ADD CONSTRAINT "QuestionTopicMap_topic_tenant_fk"
    FOREIGN KEY ("topicId", "tenantId") REFERENCES "Topic"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_student_tenant_fk"
    FOREIGN KEY ("studentId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attempt_tenant_fk"
    FOREIGN KEY ("attemptId", "tenantId") REFERENCES "Attempt"("id", "tenantId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_question_tenant_fk"
    FOREIGN KEY ("questionId", "tenantId") REFERENCES "Question"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_student_tenant_fk"
    FOREIGN KEY ("studentId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_topic_tenant_fk"
    FOREIGN KEY ("topicId", "tenantId") REFERENCES "Topic"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcard_tenant_fk"
    FOREIGN KEY ("flashcardId", "tenantId") REFERENCES "Flashcard"("id", "tenantId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_student_tenant_fk"
    FOREIGN KEY ("studentId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "TopicResource" ADD CONSTRAINT "TopicResource_topic_tenant_fk"
    FOREIGN KEY ("topicId", "tenantId") REFERENCES "Topic"("id", "tenantId") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
