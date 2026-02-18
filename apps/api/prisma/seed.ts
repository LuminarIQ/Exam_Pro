import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'public' },
    update: {},
    create: { id: 'public', name: 'Public Tenant' },
  });
  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      aiMonthlyQuota: 1000,
      aiUsedThisMonth: 0,
      aiQuotaResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    },
  });

  const pass = await bcrypt.hash('Password123!', 10);
  const [admin, teacher, student] = await Promise.all([
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.com' } },
      update: { name: 'Demo Admin', role: 'ADMIN', passwordHash: pass },
      create: { tenantId: tenant.id, name: 'Demo Admin', email: 'admin@demo.com', passwordHash: pass, role: 'ADMIN' },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'teacher@demo.com' } },
      update: { name: 'Demo Teacher', role: 'TEACHER', passwordHash: pass },
      create: { tenantId: tenant.id, name: 'Demo Teacher', email: 'teacher@demo.com', passwordHash: pass, role: 'TEACHER' },
    }),
    prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'student@demo.com' } },
      update: { name: 'Demo Student', role: 'STUDENT', passwordHash: pass },
      create: { tenantId: tenant.id, name: 'Demo Student', email: 'student@demo.com', passwordHash: pass, role: 'STUDENT' },
    }),
  ]);

  const subject = await prisma.subject.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Mathematics' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Mathematics' },
  });
  const chapter1 = await prisma.chapter.upsert({
    where: { tenantId_subjectId_name: { tenantId: tenant.id, subjectId: subject.id, name: 'Algebra' } },
    update: {},
    create: { tenantId: tenant.id, subjectId: subject.id, name: 'Algebra' },
  });
  const chapter2 = await prisma.chapter.upsert({
    where: { tenantId_subjectId_name: { tenantId: tenant.id, subjectId: subject.id, name: 'Geometry' } },
    update: {},
    create: { tenantId: tenant.id, subjectId: subject.id, name: 'Geometry' },
  });

  const topics = await Promise.all([
    prisma.topic.upsert({
      where: { tenantId_chapterId_name: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Linear Equations' } },
      update: {},
      create: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Linear Equations' },
    }),
    prisma.topic.upsert({
      where: { tenantId_chapterId_name: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Quadratics' } },
      update: {},
      create: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Quadratics' },
    }),
    prisma.topic.upsert({
      where: { tenantId_chapterId_name: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Inequalities' } },
      update: {},
      create: { tenantId: tenant.id, chapterId: chapter1.id, name: 'Inequalities' },
    }),
    prisma.topic.upsert({
      where: { tenantId_chapterId_name: { tenantId: tenant.id, chapterId: chapter2.id, name: 'Triangles' } },
      update: {},
      create: { tenantId: tenant.id, chapterId: chapter2.id, name: 'Triangles' },
    }),
    prisma.topic.upsert({
      where: { tenantId_chapterId_name: { tenantId: tenant.id, chapterId: chapter2.id, name: 'Circles' } },
      update: {},
      create: { tenantId: tenant.id, chapterId: chapter2.id, name: 'Circles' },
    }),
  ]);

  await prisma.topicPrerequisite.upsert({
    where: {
      tenantId_topicId_prerequisiteTopicId: {
        tenantId: tenant.id,
        topicId: topics[1].id,
        prerequisiteTopicId: topics[0].id,
      },
    },
    update: {},
    create: { tenantId: tenant.id, topicId: topics[1].id, prerequisiteTopicId: topics[0].id },
  });

  for (const topic of topics) {
    await prisma.topicResource.upsert({
      where: {
        id: `seed-${tenant.id}-${topic.id}-doc`,
      },
      update: {
        title: `${topic.name} Notes`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(topic.name)}`,
        type: 'DOCUMENT',
        isActive: true,
      },
      create: {
        id: `seed-${tenant.id}-${topic.id}-doc`,
        tenantId: tenant.id,
        topicId: topic.id,
        type: 'DOCUMENT',
        title: `${topic.name} Notes`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(topic.name)}`,
        priority: 1,
        isActive: true,
      },
    });
  }

  const existingQuestionCount = await prisma.question.count({ where: { tenantId: tenant.id } });
  if (existingQuestionCount < 20) {
    for (let i = 0; i < 20; i++) {
      const topic = topics[i % topics.length];
      await prisma.question.create({
        data: {
          tenantId: tenant.id,
          stem: `Q${i + 1}: What is ${i} + ${i}?`,
          explanation: 'Add both numbers.',
          expectedSolveTimeSec: 60,
          source: 'MANUAL',
          status: 'PUBLISHED',
          difficulty: 1200 + (i % 5) * 20,
          createdById: teacher.id,
          options: {
            create: [
              { tenantId: tenant.id, text: `${i + i}`, isCorrect: true },
              { tenantId: tenant.id, text: `${i + i + 1}`, isCorrect: false },
              { tenantId: tenant.id, text: `${i + i + 2}`, isCorrect: false },
              { tenantId: tenant.id, text: `${i + i + 3}`, isCorrect: false },
            ],
          },
          topicMaps: {
            create: { tenantId: tenant.id, topicId: topic.id, weight: 1 },
          },
        },
      });
    }
  }

  const existingFlashcardCount = await prisma.flashcard.count({
    where: { tenantId: tenant.id, studentId: student.id },
  });
  if (existingFlashcardCount < 30) {
    for (let i = 0; i < 30; i++) {
      const topic = topics[i % topics.length];
      await prisma.flashcard.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          topicId: topic.id,
          prompt: `Flashcard ${i + 1}: Define concept in ${topic.name}`,
          answer: `Answer ${i + 1}`,
        },
      });
    }
  }

  await prisma.enrollment.upsert({
    where: { tenantId_studentId_subjectId: { tenantId: tenant.id, studentId: student.id, subjectId: subject.id } },
    update: {},
    create: { tenantId: tenant.id, studentId: student.id, subjectId: subject.id },
  });

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
