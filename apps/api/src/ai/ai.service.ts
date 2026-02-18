import {
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { Job, Queue, Worker } from 'bullmq';
import { MetricsService } from '../observability/metrics.service';
import { z } from 'zod';
import { createHash } from 'crypto';

interface IAIProvider {
  readonly name: string;
  generateQuestion(payload: { topicIds: string[] }): Promise<{
    stem: string;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
    difficulty: number;
  }>;
  analyzeDiagnostic(payload: {
    accuracy: number;
    averageTimeRatio: number;
    weakTopics: string[];
    strengths: string[];
    nextBestAction: string;
  }): Promise<{
    summary: string;
    interventions: string[];
    confidence: number;
    references?: Array<{
      topic: string;
      type: 'TOPIC' | 'VIDEO' | 'DOCUMENT';
      title: string;
      url: string;
    }>;
  }>;
}

const GeneratedQuestionSchema = z.object({
  stem: z.string().min(12).max(2000),
  explanation: z.string().min(8).max(3000),
  options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).length(4),
  difficulty: z.number().int().min(800).max(2400),
});

class StubAIProvider implements IAIProvider {
  readonly name = 'stub';

  async generateQuestion(payload: { topicIds: string[] }) {
    return {
      stem: `AI draft question for topics: ${payload.topicIds.join(', ')}`,
      explanation: 'Stub-generated explanation. TODO: replace with real provider.',
      options: [
        { text: 'Option A', isCorrect: true },
        { text: 'Option B', isCorrect: false },
        { text: 'Option C', isCorrect: false },
        { text: 'Option D', isCorrect: false },
      ],
      difficulty: 1200,
    };
  }

  async analyzeDiagnostic(payload: {
    accuracy: number;
    averageTimeRatio: number;
    weakTopics: string[];
    strengths: string[];
    nextBestAction: string;
  }) {
    const pace =
      payload.averageTimeRatio < 0.9
        ? 'pace is slow'
        : payload.averageTimeRatio > 1.15
          ? 'pace is fast'
          : 'pace is balanced';
    const accuracyPct = Math.round(payload.accuracy * 100);
    const summary =
      `Diagnostic accuracy is ${accuracyPct}% and ${pace}. ` +
      `Primary next action: ${payload.nextBestAction}.`;
    const interventions: string[] = [];
    if (payload.weakTopics.length) {
      interventions.push(`Revise weak topics: ${payload.weakTopics.slice(0, 3).join(', ')}`);
    }
    if (payload.accuracy < 0.6) {
      interventions.push('Use concept-first practice before timed sets.');
    } else if (payload.averageTimeRatio < 0.9) {
      interventions.push('Run timed drills to improve speed without losing accuracy.');
    } else {
      interventions.push('Increase difficulty gradually on strongest topics.');
    }
    if (payload.strengths.length) {
      interventions.push(`Leverage strengths: ${payload.strengths.slice(0, 2).join(', ')}`);
    }
    const references = this.fallbackReferences(payload.weakTopics);
    return { summary, interventions, confidence: 0.72, references };
  }

  private fallbackReferences(topics: string[]) {
    return topics.slice(0, 3).flatMap((topic) => [
      {
        topic,
        type: 'TOPIC' as const,
        title: `${topic} Topic Overview`,
        url: `/student/dashboard?topic=${encodeURIComponent(topic)}`,
      },
      {
        topic,
        type: 'VIDEO' as const,
        title: `${topic} Video Lessons`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' math tutorial')}`,
      },
      {
        topic,
        type: 'DOCUMENT' as const,
        title: `${topic} Reference Notes`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(topic)}`,
      },
    ]);
  }
}

class OpenAIProvider implements IAIProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async generateQuestion(payload: { topicIds: string[] }) {
    const system = 'You generate high quality MCQ questions. Return strict JSON only.';
    const user = [
      'Generate one MCQ question.',
      `Topics: ${payload.topicIds.join(', ')}`,
      'Return JSON with keys: stem, explanation, options (array of 4 strings), correctIndex (0-3), difficulty (800-2400).',
    ].join('\n');

    const out = await this.chatJson(system, user);
    const options = Array.isArray(out?.options) ? out.options : [];
    const correctIndex = Number(out?.correctIndex ?? 0);
    if (options.length !== 4 || correctIndex < 0 || correctIndex > 3) {
      throw new Error('Invalid AI question output');
    }
    return {
      stem: String(out?.stem || 'Generated question'),
      explanation: String(out?.explanation || 'No explanation provided'),
      options: options.map((text: string, idx: number) => ({ text: String(text), isCorrect: idx === correctIndex })),
      difficulty: Math.max(800, Math.min(2400, Number(out?.difficulty || 1200))),
    };
  }

  async analyzeDiagnostic(payload: {
    accuracy: number;
    averageTimeRatio: number;
    weakTopics: string[];
    strengths: string[];
    nextBestAction: string;
  }) {
    const system = 'You are an adaptive tutor analytics assistant. Return strict JSON only.';
    const user = `
Input:
- accuracy: ${payload.accuracy}
- average_time_ratio: ${payload.averageTimeRatio}
- weak_topics: ${JSON.stringify(payload.weakTopics)}
- strengths: ${JSON.stringify(payload.strengths)}
- next_best_action: ${payload.nextBestAction}

Tasks:
1) Write a concise diagnostic summary (2-3 sentences).
2) Provide 3 intervention steps personalized to weak topics and pace profile.
3) Provide 2-6 reference links to topic study materials, videos, or docs.
3) Keep tone actionable and teacher-friendly.
4) Avoid hallucinations; use only provided data.

Output JSON:
{
  "summary": "string",
  "interventions": ["string", "string", "string"],
  "confidence": 0.0,
  "references": [
    { "topic": "string", "type": "TOPIC|VIDEO|DOCUMENT", "title": "string", "url": "https://..." }
  ]
}`.trim();

    const out = await this.chatJson(system, user);
    const interventions = Array.isArray(out?.interventions)
      ? out.interventions.map((x: any) => String(x)).slice(0, 3)
      : [];
    return {
      summary: String(out?.summary || 'Diagnostic analysis unavailable.'),
      interventions: interventions.length ? interventions : ['Review weakest topics with guided practice.'],
      confidence: Math.max(0, Math.min(1, Number(out?.confidence ?? 0.7))),
      references: this.normalizeReferences(out?.references, payload.weakTopics),
    };
  }

  private async chatJson(system: string, user: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI request failed: ${response.status} ${errText}`);
      }
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned empty content');
      return this.safeJsonParse(content);
    } finally {
      clearTimeout(timer);
    }
  }

  private safeJsonParse(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    }
  }

  private normalizeReferences(input: any, weakTopics: string[]) {
    const refs = Array.isArray(input) ? input : [];
    const normalized = refs
      .map((r: any) => ({
        topic: String(r?.topic || weakTopics[0] || 'General'),
        type: ['TOPIC', 'VIDEO', 'DOCUMENT'].includes(String(r?.type || '').toUpperCase())
          ? (String(r.type).toUpperCase() as 'TOPIC' | 'VIDEO' | 'DOCUMENT')
          : 'DOCUMENT',
        title: String(r?.title || 'Reference'),
        url: String(r?.url || ''),
      }))
      .filter((r: any) => r.url.startsWith('http://') || r.url.startsWith('https://') || r.url.startsWith('/'))
      .slice(0, 8);
    return normalized;
  }
}

class GeminiProvider implements IAIProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async generateQuestion(payload: { topicIds: string[] }) {
    const prompt = [
      'Generate one high-quality MCQ question.',
      `Topics: ${payload.topicIds.join(', ')}`,
      'Return strict JSON with keys: stem, explanation, options (array of 4 strings), correctIndex (0-3), difficulty (800-2400).',
    ].join('\n');

    const out = await this.generateJson(prompt);
    const options = Array.isArray(out?.options) ? out.options : [];
    const correctIndex = Number(out?.correctIndex ?? 0);
    if (options.length !== 4 || correctIndex < 0 || correctIndex > 3) {
      throw new Error('Invalid Gemini question output');
    }
    return {
      stem: String(out?.stem || 'Generated question'),
      explanation: String(out?.explanation || 'No explanation provided'),
      options: options.map((text: string, idx: number) => ({ text: String(text), isCorrect: idx === correctIndex })),
      difficulty: Math.max(800, Math.min(2400, Number(out?.difficulty || 1200))),
    };
  }

  async analyzeDiagnostic(payload: {
    accuracy: number;
    averageTimeRatio: number;
    weakTopics: string[];
    strengths: string[];
    nextBestAction: string;
  }) {
    const prompt = `
You are an adaptive tutor analytics assistant.

Input:
- accuracy: ${payload.accuracy}
- average_time_ratio: ${payload.averageTimeRatio}
- weak_topics: ${JSON.stringify(payload.weakTopics)}
- strengths: ${JSON.stringify(payload.strengths)}
- next_best_action: ${payload.nextBestAction}

Tasks:
1) Write a concise diagnostic summary (2-3 sentences).
2) Provide 3 intervention steps personalized to weak topics and pace profile.
3) Provide 2-6 reference links to topic study materials, videos, or docs.
3) Keep tone actionable and teacher-friendly.
4) Avoid hallucinations; use only provided data.

Return strict JSON:
{
  "summary": "string",
  "interventions": ["string", "string", "string"],
  "confidence": 0.0,
  "references": [
    { "topic": "string", "type": "TOPIC|VIDEO|DOCUMENT", "title": "string", "url": "https://..." }
  ]
}`.trim();

    const out = await this.generateJson(prompt);
    const interventions = Array.isArray(out?.interventions)
      ? out.interventions.map((x: any) => String(x)).slice(0, 3)
      : [];
    return {
      summary: String(out?.summary || 'Diagnostic analysis unavailable.'),
      interventions: interventions.length ? interventions : ['Review weakest topics with guided practice.'],
      confidence: Math.max(0, Math.min(1, Number(out?.confidence ?? 0.7))),
      references: this.normalizeReferences(out?.references, payload.weakTopics),
    };
  }

  private async generateJson(prompt: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini request failed: ${response.status} ${errText}`);
      }
      const json = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned empty content');
      return this.safeJsonParse(String(text));
    } finally {
      clearTimeout(timer);
    }
  }

  private safeJsonParse(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    }
  }

  private normalizeReferences(input: any, weakTopics: string[]) {
    const refs = Array.isArray(input) ? input : [];
    const normalized = refs
      .map((r: any) => ({
        topic: String(r?.topic || weakTopics[0] || 'General'),
        type: ['TOPIC', 'VIDEO', 'DOCUMENT'].includes(String(r?.type || '').toUpperCase())
          ? (String(r.type).toUpperCase() as 'TOPIC' | 'VIDEO' | 'DOCUMENT')
          : 'DOCUMENT',
        title: String(r?.title || 'Reference'),
        url: String(r?.url || ''),
      }))
      .filter((r: any) => r.url.startsWith('http://') || r.url.startsWith('https://') || r.url.startsWith('/'))
      .slice(0, 8);
    return normalized;
  }
}

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  };
  private queue: Queue | null = null;
  private dlq: Queue | null = null;
  private readonly provider: IAIProvider;
  private worker: Worker | null = null;
  private quotaResetTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly metrics: MetricsService,
  ) {
    this.provider = this.buildProvider();
  }

  onModuleInit() {
    this.initQueueInfra();
    const intervalMs = Number(process.env.AI_QUOTA_RESET_INTERVAL_MS || 60 * 60 * 1000);
    this.quotaResetTimer = setInterval(() => {
      void this.resetExpiredTenantQuotas();
    }, intervalMs);
  }

  private initQueueInfra() {
    try {
      this.queue = new Queue('generate-question', { connection: this.connection });
      this.dlq = new Queue('generate-question-dlq', { connection: this.connection });
      this.worker = new Worker(
        'generate-question',
        async (job: Job) => {
          const { requestId, tenantId, topicIds, userId } = job.data as any;
          const request = await this.prisma.questionGenerationRequest.findFirst({
            where: { id: requestId, tenantId },
          });
          if (!request) throw new Error('Question generation request not found');

          const prompt = await this.resolvePromptVersion(tenantId, request.promptVersion);
          if (!prompt?.isActive) {
            throw new Error(`Prompt version ${request.promptVersion} is not active for tenant ${tenantId}`);
          }

          const raw = await this.provider.generateQuestion({ topicIds });
          const generated = GeneratedQuestionSchema.parse(raw);
          const outputHash = this.computeQuestionHash(generated.stem, generated.options.map((o) => o.text));
          const governance = this.computeGovernanceSignals(generated, prompt.template);
          const duplicate = await this.prisma.question.findFirst({
            where: { tenantId, contentHash: outputHash },
            select: { id: true },
          });
          if (duplicate) {
            await this.prisma.questionGenerationRequest.update({
              where: { id: requestId },
              data: {
                status: 'FAILED',
                error: `Duplicate generated question fingerprint ${outputHash}`,
                provider: this.provider.name,
                outputHash,
                dedupeDetected: true,
                aiConfidence: governance.aiConfidence,
                hallucinationRisk: governance.hallucinationRisk,
                plagiarismScore: governance.plagiarismScore,
                rubricCompliant: governance.rubricCompliant,
              },
            });
            this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'duplicate' });
            return;
          }

          const q = await this.questionsService.create(tenantId, userId, {
            topicIds,
            stem: generated.stem,
            explanation: generated.explanation,
            expectedSolveTimeSec: 60,
            options: generated.options,
            source: 'AI',
            difficulty: generated.difficulty,
          });
          await this.prisma.question.update({
            where: { id: q.id },
            data: { contentHash: outputHash },
          });

          await this.prisma.questionGenerationRequest.update({
            where: { id: requestId },
            data: {
              status: 'GENERATED',
              resultQuestionId: q.id,
              provider: this.provider.name,
              outputHash,
              aiConfidence: governance.aiConfidence,
              hallucinationRisk: governance.hallucinationRisk,
              plagiarismScore: governance.plagiarismScore,
              rubricCompliant: governance.rubricCompliant,
              dedupeDetected: false,
            },
          });
          this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'generated' });
        },
        { connection: this.connection },
      );

      this.worker.on('failed', async (job, err) => {
        if (!job || !this.dlq) return;
        const maxAttempts = Number(process.env.AI_JOB_ATTEMPTS || 3);
        if (job.attemptsMade < maxAttempts) return;

        const { requestId, tenantId } = job.data as any;
        await this.prisma.questionGenerationRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED', error: err.message },
        });
        this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'failed' });

        await this.dlq.add(
          'failed-generate',
          {
            requestId,
            tenantId,
            payload: job.data,
            reason: err.message,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: true, removeOnFail: false },
        );
      });
    } catch (error) {
      console.error('AI queue init failed; continuing in degraded mode', error);
      this.queue = null;
      this.dlq = null;
      this.worker = null;
    }
  }

  private async resetExpiredTenantQuotas() {
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await this.prisma.tenantSettings.updateMany({
      where: { aiQuotaResetAt: { lte: now } },
      data: { aiUsedThisMonth: 0, aiQuotaResetAt: nextMonthStart },
    });
  }

  async enqueueGenerateQuestion(
    tenantId: string,
    userId: string,
    body: { topicIds: string[]; promptVersion?: string },
  ) {
    const requestedPromptVersion = body.promptVersion || 'v1';
    const prompt = await this.resolvePromptVersion(tenantId, requestedPromptVersion);
    if (!prompt || !prompt.isActive) {
      throw new ForbiddenException(`Prompt version ${requestedPromptVersion} is not active`);
    }

    const now = new Date();
    const defaultQuota = Number(process.env.DEFAULT_AI_MONTHLY_QUOTA || 1000);
    const settings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        aiMonthlyQuota: defaultQuota,
        aiUsedThisMonth: 0,
        aiQuotaResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
      update: {},
    });

    let used = settings.aiUsedThisMonth;
    let limit = settings.aiMonthlyQuota;

    if (settings.aiQuotaResetAt <= now) {
      const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const reset = await this.prisma.tenantSettings.update({
        where: { tenantId },
        data: { aiUsedThisMonth: 0, aiQuotaResetAt: resetAt },
      });
      used = reset.aiUsedThisMonth;
      limit = reset.aiMonthlyQuota;
    }

    if (used >= limit) {
      this.metrics.aiQuotaUsed.set({ tenant: tenantId }, used);
      this.metrics.aiQuotaLimit.set({ tenant: tenantId }, limit);
      this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'quota_blocked' });
      throw new ForbiddenException('AI generation quota exceeded for current billing cycle');
    }

    const updatedSettings = await this.prisma.tenantSettings.update({
      where: { tenantId },
      data: { aiUsedThisMonth: { increment: 1 } },
    });
    this.metrics.aiQuotaUsed.set({ tenant: tenantId }, updatedSettings.aiUsedThisMonth);
    this.metrics.aiQuotaLimit.set({ tenant: tenantId }, updatedSettings.aiMonthlyQuota);

    const request = await this.prisma.questionGenerationRequest.create({
      data: {
        tenantId,
        requestedById: userId,
        promptVersion: requestedPromptVersion,
        payload: body as any,
        status: 'QUEUED',
      },
    });

    if (!this.queue) {
      throw new ServiceUnavailableException('AI queue unavailable');
    }

    const job = await this.queue.add('generate', {
      requestId: request.id,
      tenantId,
      userId,
      topicIds: body.topicIds,
    }, {
      attempts: Number(process.env.AI_JOB_ATTEMPTS || 3),
      backoff: { type: 'exponential', delay: Number(process.env.AI_JOB_BACKOFF_MS || 1000) },
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'queued' });

    await this.prisma.questionGenerationRequest.update({
      where: { id: request.id },
      data: { jobId: job.id?.toString() },
    });

    return { requestId: request.id, jobId: job.id };
  }

  async listPromptVersions(tenantId: string) {
    return this.prisma.promptVersion.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertPromptVersion(
    tenantId: string,
    actorId: string,
    payload: { version: string; template: string; isActive?: boolean },
  ) {
    const version = payload.version.trim();
    if (!version) {
      throw new ForbiddenException('Prompt version cannot be empty');
    }
    if (payload.isActive) {
      await this.prisma.promptVersion.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      });
    }
    return this.prisma.promptVersion.upsert({
      where: { tenantId_version: { tenantId, version } },
      update: {
        template: payload.template,
        isActive: Boolean(payload.isActive),
        createdById: actorId,
      },
      create: {
        tenantId,
        version,
        template: payload.template,
        isActive: Boolean(payload.isActive),
        createdById: actorId,
      },
    });
  }

  async queueMetrics() {
    if (!this.queue || !this.dlq) {
      return {
        queue: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        dlq: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        recentFailed: [],
        recentDeadLetters: [],
      };
    }

    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    const dlqCounts = await this.dlq.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const failed = await this.queue.getFailed(0, 10);
    const deadLetters = await this.dlq.getJobs(['waiting', 'failed', 'delayed'], 0, 10);

    return {
      queue: counts,
      dlq: dlqCounts,
      recentFailed: failed.map((j) => ({
        id: j.id,
        name: j.name,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        data: j.data,
      })),
      recentDeadLetters: deadLetters.map((j) => ({ id: j.id, name: j.name, data: j.data })),
    };
  }

  async analyzeDiagnosticAttempt(payload: {
    tenantId: string;
    accuracy: number;
    averageTimeRatio: number;
    weakTopics: string[];
    weakTopicIds?: string[];
    strengths: string[];
    nextBestAction: string;
  }) {
    const ai = await this.provider.analyzeDiagnostic(payload);
    const tenantReferences = await this.tenantTopicReferences(
      payload.tenantId,
      payload.weakTopicIds || [],
      payload.weakTopics || [],
    );
    const references = ai.references?.length
      ? this.mergeReferences(tenantReferences, ai.references)
      : this.mergeReferences(tenantReferences, this.defaultReferences(payload.weakTopics));
    return {
      model: `${this.provider.name}-diagnostic-v1`,
      generatedAt: new Date().toISOString(),
      ...ai,
      references,
    };
  }

  private buildProvider(): IAIProvider {
    const provider = (process.env.AI_PROVIDER || 'stub').toLowerCase();
    if (provider === 'gemini' || provider === 'gemani') {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('AI_PROVIDER=gemini but GEMINI_API_KEY missing. Falling back to stub provider.');
        return new StubAIProvider();
      }
      return new GeminiProvider(
        apiKey,
        process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
        Number(process.env.GEMINI_TIMEOUT_MS || 15000),
      );
    }
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        console.warn('AI_PROVIDER=openai but OPENAI_API_KEY missing. Falling back to stub provider.');
        return new StubAIProvider();
      }
      return new OpenAIProvider(
        apiKey,
        process.env.OPENAI_MODEL || 'gpt-4o-mini',
        process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        Number(process.env.OPENAI_TIMEOUT_MS || 15000),
      );
    }
    return new StubAIProvider();
  }

  private defaultReferences(topics: string[]) {
    return topics.slice(0, 3).flatMap((topic) => [
      {
        topic,
        type: 'TOPIC' as const,
        title: `${topic} Topic Overview`,
        url: `/student/dashboard?topic=${encodeURIComponent(topic)}`,
      },
      {
        topic,
        type: 'VIDEO' as const,
        title: `${topic} Video Lessons`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' tutorial')}`,
      },
      {
        topic,
        type: 'DOCUMENT' as const,
        title: `${topic} Reference Notes`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(topic)}`,
      },
    ]);
  }

  private async tenantTopicReferences(tenantId: string, topicIds: string[], topicNames: string[]) {
    if (!tenantId) return [];
    const byIds = topicIds.length
      ? await this.prisma.topicResource.findMany({
          where: { tenantId, topicId: { in: topicIds }, isActive: true },
          include: { topic: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          take: 12,
        })
      : [];
    if (byIds.length) {
      return byIds.map((r) => ({
        topic: r.topic.name,
        type: (r.type as 'TOPIC' | 'VIDEO' | 'DOCUMENT') || 'DOCUMENT',
        title: r.title,
        url: r.url,
      }));
    }

    if (!topicNames.length) return [];
    const byName = await this.prisma.topicResource.findMany({
      where: {
        tenantId,
        isActive: true,
        topic: { name: { in: topicNames } },
      },
      include: { topic: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 12,
    });
    return byName.map((r) => ({
      topic: r.topic.name,
      type: (r.type as 'TOPIC' | 'VIDEO' | 'DOCUMENT') || 'DOCUMENT',
      title: r.title,
      url: r.url,
    }));
  }

  private mergeReferences(
    curated: Array<{ topic: string; type: 'TOPIC' | 'VIDEO' | 'DOCUMENT'; title: string; url: string }>,
    generated: Array<{ topic: string; type: 'TOPIC' | 'VIDEO' | 'DOCUMENT'; title: string; url: string }>,
  ) {
    const merged = new Map<string, { topic: string; type: 'TOPIC' | 'VIDEO' | 'DOCUMENT'; title: string; url: string }>();
    [...curated, ...generated].forEach((r) => {
      if (!r?.url) return;
      if (!merged.has(r.url)) merged.set(r.url, r);
    });
    return Array.from(merged.values()).slice(0, 12);
  }

  private async resolvePromptVersion(tenantId: string, requestedVersion: string) {
    const exact = await this.prisma.promptVersion.findUnique({
      where: { tenantId_version: { tenantId, version: requestedVersion } },
    });
    if (exact) return exact;
    return this.prisma.promptVersion.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private computeQuestionHash(stem: string, options: string[]) {
    const normalizedStem = stem.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedOptions = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
    return createHash('sha256').update(`${normalizedStem}::${normalizedOptions}`).digest('hex');
  }

  private computeGovernanceSignals(
    generated: z.infer<typeof GeneratedQuestionSchema>,
    promptTemplate: string,
  ) {
    const words = generated.stem.trim().split(/\s+/).length;
    const explanationWords = generated.explanation.trim().split(/\s+/).length;
    const optionUniq = new Set(generated.options.map((o) => o.text.trim().toLowerCase())).size;
    const rubricCompliant = optionUniq === 4 && generated.options.filter((o) => o.isCorrect).length === 1;
    const aiConfidence = Math.min(0.95, 0.4 + Math.min(20, words) / 40 + Math.min(30, explanationWords) / 100);
    const hallucinationRisk = Math.max(0.05, generated.explanation.length < 20 ? 0.45 : 0.18);
    const plagiarismScore = this.similarityHint(generated.stem, promptTemplate);
    return {
      rubricCompliant,
      aiConfidence,
      hallucinationRisk,
      plagiarismScore,
    };
  }

  private similarityHint(a: string, b: string) {
    const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
    const denom = Math.max(tokensA.size, 1);
    return Math.min(1, overlap / denom);
  }

  async onModuleDestroy() {
    if (this.quotaResetTimer) clearInterval(this.quotaResetTimer);
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (this.dlq) await this.dlq.close();
  }
}
