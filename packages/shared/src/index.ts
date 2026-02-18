import { z } from 'zod';

export const RoleSchema = z.enum(['STUDENT', 'TEACHER', 'ADMIN']);
export type Role = z.infer<typeof RoleSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  captchaToken: z.string().optional(),
});

export const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: RoleSchema.default('STUDENT'),
});

export const VerifyEmailSchema = z.object({
  email: z.string().email(),
  token: z.string().min(12),
});

export const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

export const LogoutSessionSchema = z.object({
  sessionId: z.string().optional(),
});

export const CreateQuestionSchema = z.object({
  topicIds: z.array(z.string()).min(1),
  stem: z.string().min(5),
  explanation: z.string().optional(),
  expectedSolveTimeSec: z.number().int().positive().default(60),
  options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).length(4),
  source: z.enum(['MANUAL', 'AI']).default('MANUAL'),
  difficulty: z.number().int().min(800).max(2400).default(1200),
});

export const StartDiagnosticSchema = z.object({
  topicIds: z.array(z.string()).min(1),
  questionCount: z.number().int().min(1).max(30).default(10),
});

export const SubmitAttemptSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedOptionId: z.string(),
      timeSpentSec: z.number().int().min(1).max(3600),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export const ApproveQuestionSchema = z.object({
  questionId: z.string(),
  publish: z.boolean().default(false),
});

export const RejectQuestionSchema = z.object({
  questionId: z.string(),
  reason: z.string().min(3),
});

export const ReviewFlashcardSchema = z.object({
  quality: z.number().int().min(0).max(5),
});

export const CreateTaxonomySchema = z.object({
  name: z.string().min(2),
  subjectId: z.string().optional(),
  chapterId: z.string().optional(),
});

export const CreatePrerequisiteSchema = z.object({
  topicId: z.string(),
  prerequisiteTopicId: z.string(),
});

export const CreateAdminUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: RoleSchema,
});

export const UpdateUserRoleSchema = z.object({
  role: RoleSchema,
});

export const UpdateQuestionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED']),
});

export const TopicResourceTypeSchema = z.enum(['TOPIC', 'VIDEO', 'DOCUMENT']);

export const CreateTopicResourceSchema = z.object({
  topicId: z.string(),
  type: TopicResourceTypeSchema,
  title: z.string().min(3),
  url: z.string().url(),
  priority: z.number().int().min(1).max(100).default(1),
});
