import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { Job, Queue, Worker } from 'bullmq';
import { MetricsService } from '../observability/metrics.service';

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
  private readonly queue = new Queue('generate-question', { connection: this.connection });
  private readonly dlq = new Queue('generate-question-dlq', { connection: this.connection });
  private readonly provider: IAIProvider;
  private readonly worker: Worker;
  private quotaResetTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly metrics: MetricsService,
  ) {
    this.provider = this.buildProvider();
    this.worker = new Worker(
      'generate-question',
      async (job: Job) => {
        const { requestId, tenantId, topicIds, userId } = job.data as any;
        const generated = await this.provider.generateQuestion({ topicIds });
        const q = await this.questionsService.create(tenantId, userId, {
          topicIds,
          stem: generated.stem,
          explanation: generated.explanation,
          expectedSolveTimeSec: 60,
          options: generated.options,
          source: 'AI',
          difficulty: generated.difficulty,
        });

        await this.prisma.questionGenerationRequest.update({
          where: { id: requestId },
          data: { status: 'GENERATED', resultQuestionId: q.id },
        });
        this.metrics.aiJobsTotal.inc({ tenant: tenantId, status: 'generated' });
      },
      { connection: this.connection },
    );

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
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
  }

  onModuleInit() {
    const intervalMs = Number(process.env.AI_QUOTA_RESET_INTERVAL_MS || 60 * 60 * 1000);
    this.quotaResetTimer = setInterval(() => {
      void this.resetExpiredTenantQuotas();
    }, intervalMs);
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
        promptVersion: body.promptVersion || 'v1',
        payload: body as any,
        status: 'QUEUED',
      },
    });

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

  async queueMetrics() {
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

  async onModuleDestroy() {
    if (this.quotaResetTimer) clearInterval(this.quotaResetTimer);
    await this.worker.close();
    await this.queue.close();
    await this.dlq.close();
  }
}
