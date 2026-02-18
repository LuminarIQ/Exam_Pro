import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { QuestionSource, QuestionStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly csvHeaders = [
    'subject',
    'chapter',
    'topic',
    'stem',
    'explanation',
    'difficulty',
    'expectedSolveTimeSec',
    'optionA',
    'optionB',
    'optionC',
    'optionD',
    'correctOption',
    'source',
    'status',
  ];

  users(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  async createUser(tenantId: string, actorId: string, body: any) {
    const passwordHash = await bcrypt.hash(body.password || 'Password123!', 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'USER_CREATE',
        entityType: 'User',
        entityId: user.id,
        payload: user as any,
      },
    });

    return user;
  }

  async updateUserRole(tenantId: string, actorId: string, id: string, role: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const user = await this.prisma.user.update({ where: { id }, data: { role: role as any } });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'USER_ROLE_UPDATE',
        entityType: 'User',
        entityId: id,
        payload: { role } as any,
      },
    });
    return user;
  }

  questions(tenantId: string) {
    return this.prisma.question.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { options: true, topicMaps: true },
      take: 200,
    });
  }

  async setQuestionStatus(tenantId: string, actorId: string, id: string, status: string) {
    const existing = await this.prisma.question.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const question = await this.prisma.question.update({ where: { id }, data: { status: status as any } });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'QUESTION_STATUS_UPDATE',
        entityType: 'Question',
        entityId: id,
        payload: { status } as any,
      },
    });
    return question;
  }

  logs(tenantId: string) {
    return this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async tenantMetrics(tenantId: string) {
    const [activeUsers, aiRequests, approvedQuestions, draftQuestions, settings] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.questionGenerationRequest.count({ where: { tenantId } }),
      this.prisma.question.count({ where: { tenantId, status: { in: ['APPROVED', 'PUBLISHED'] } } }),
      this.prisma.question.count({ where: { tenantId, status: 'DRAFT' } }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
    ]);

    return {
      activeUsers,
      aiUsage: {
        used: settings?.aiUsedThisMonth ?? 0,
        limit: settings?.aiMonthlyQuota ?? Number(process.env.DEFAULT_AI_MONTHLY_QUOTA || 1000),
      },
      questionGovernance: {
        approvedQuestions,
        draftQuestions,
      },
      aiRequests,
    };
  }

  async importQuestionBankCsv(tenantId: string, actorId: string, csvText: string) {
    const rows = this.parseCsv(csvText);
    if (!rows.length) {
      return { totalRows: 0, createdQuestions: 0, skippedRows: 0, errors: [] };
    }

    const headerKeys = Object.keys(rows[0]);
    for (const h of this.csvHeaders) {
      if (!headerKeys.includes(h)) {
        throw new BadRequestException(`Missing CSV header: ${h}`);
      }
    }

    let createdQuestions = 0;
    let skippedRows = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const subjectName = row.subject?.trim();
        const chapterName = row.chapter?.trim();
        const topicName = row.topic?.trim();
        const stem = row.stem?.trim();
        if (!subjectName || !chapterName || !topicName || !stem) {
          throw new Error('subject, chapter, topic and stem are required');
        }

        const subject = await this.prisma.subject.upsert({
          where: { tenantId_name: { tenantId, name: subjectName } },
          update: {},
          create: { tenantId, name: subjectName },
        });
        const chapter = await this.prisma.chapter.upsert({
          where: { tenantId_subjectId_name: { tenantId, subjectId: subject.id, name: chapterName } },
          update: {},
          create: { tenantId, subjectId: subject.id, name: chapterName },
        });
        const topic = await this.prisma.topic.upsert({
          where: { tenantId_chapterId_name: { tenantId, chapterId: chapter.id, name: topicName } },
          update: {},
          create: { tenantId, chapterId: chapter.id, name: topicName },
        });

        const rawSource = (row.source || 'MANUAL').trim().toUpperCase();
        const source: QuestionSource = rawSource === 'AI' ? 'AI' : 'MANUAL';

        const rawStatus = (row.status || (source === 'AI' ? 'DRAFT' : 'APPROVED')).trim().toUpperCase();
        const allowedStatus: QuestionStatus[] = ['DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED'];
        const status: QuestionStatus = allowedStatus.includes(rawStatus as QuestionStatus)
          ? (rawStatus as QuestionStatus)
          : source === 'AI'
            ? 'DRAFT'
            : 'APPROVED';

        const options = [
          { text: row.optionA?.trim(), key: 'A' },
          { text: row.optionB?.trim(), key: 'B' },
          { text: row.optionC?.trim(), key: 'C' },
          { text: row.optionD?.trim(), key: 'D' },
        ];
        if (options.some((o) => !o.text)) {
          throw new Error('All options (A-D) are required');
        }

        const normalizedCorrect = (row.correctOption || '').trim().toUpperCase();
        const correctIndexMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        const correctIndex = correctIndexMap[normalizedCorrect];
        if (correctIndex === undefined) {
          throw new Error('correctOption must be A/B/C/D or 1/2/3/4');
        }

        await this.prisma.question.create({
          data: {
            tenantId,
            stem,
            explanation: row.explanation?.trim() || null,
            expectedSolveTimeSec: Number(row.expectedSolveTimeSec || 60),
            difficulty: Number(row.difficulty || 1200),
            source,
            status,
            createdById: actorId,
            options: {
              create: options.map((option, idx) => ({
                tenantId,
                text: option.text as string,
                isCorrect: idx === correctIndex,
              })),
            },
            topicMaps: {
              create: [{ tenantId, topicId: topic.id, weight: 1 }],
            },
          },
        });
        createdQuestions++;
      } catch (e: any) {
        skippedRows++;
        errors.push({ row: i + 2, error: e?.message || 'Unknown error' });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'QUESTION_BANK_UPLOAD',
        entityType: 'Question',
        entityId: `upload-${Date.now()}`,
        payload: { totalRows: rows.length, createdQuestions, skippedRows, errors } as any,
      },
    });

    return { totalRows: rows.length, createdQuestions, skippedRows, errors };
  }

  private parseCsv(csvText: string): Array<Record<string, string>> {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const headers = this.parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      return row;
    });
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  topicResources(tenantId: string) {
    return this.prisma.topicResource.findMany({
      where: { tenantId, isActive: true },
      include: { topic: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  createTopicResource(
    tenantId: string,
    actorId: string,
    body: { topicId: string; type: string; title: string; url: string; priority: number },
  ) {
    return this.prisma.topicResource.create({
      data: {
        tenantId,
        topicId: body.topicId,
        type: body.type,
        title: body.title,
        url: body.url,
        priority: body.priority,
        source: 'TENANT_CURATED',
        isActive: true,
      },
    }).then(async (resource) => {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'TOPIC_RESOURCE_CREATE',
          entityType: 'TopicResource',
          entityId: resource.id,
          payload: resource as any,
        },
      });
      return resource;
    });
  }

  async deactivateTopicResource(tenantId: string, actorId: string, id: string) {
    const existing = await this.prisma.topicResource.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const resource = await this.prisma.topicResource.update({
      where: { id },
      data: { isActive: false },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'TOPIC_RESOURCE_DEACTIVATE',
        entityType: 'TopicResource',
        entityId: id,
        payload: resource as any,
      },
    });
    return resource;
  }
}
