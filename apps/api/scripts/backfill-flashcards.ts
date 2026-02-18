import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalize(text: string | null | undefined) {
  return (text || '').trim().toLowerCase();
}

async function main() {
  const cards = await prisma.flashcard.findMany({
    where: {
      OR: [{ explanation: null }, { correctValue: null }],
    },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let sourceMatched = 0;
  let stemMatched = 0;
  let topicFallback = 0;
  let valueFallback = 0;

  for (const card of cards) {
    let question:
      | (Awaited<ReturnType<typeof prisma.question.findFirst>> & {
          options?: Array<{ text: string; isCorrect: boolean }>;
        })
      | null = null;

    if (card.sourceQuestionId) {
      question = await prisma.question.findFirst({
        where: { id: card.sourceQuestionId, tenantId: card.tenantId },
        include: { options: true },
      });
      if (question) sourceMatched++;
    }

    if (!question) {
      question = await prisma.question.findFirst({
        where: {
          tenantId: card.tenantId,
          stem: card.prompt,
          topicMaps: { some: { topicId: card.topicId } },
        },
        include: { options: true },
      });
      if (question) stemMatched++;
    }

    if (!question) {
      question = await prisma.question.findFirst({
        where: {
          tenantId: card.tenantId,
          status: { in: ['APPROVED', 'PUBLISHED'] },
          topicMaps: { some: { topicId: card.topicId } },
        },
        include: { options: true },
        orderBy: { createdAt: 'desc' },
      });
      if (question) topicFallback++;
    }

    const correctOption = question?.options?.find((o) => o.isCorrect) || null;
    const resolvedCorrectValue = card.correctValue || correctOption?.text || card.answer;

    let resolvedExplanation = card.explanation;
    if (!resolvedExplanation) {
      resolvedExplanation = question?.explanation || null;
      if (!resolvedExplanation) {
        resolvedExplanation = `Correct value is ${resolvedCorrectValue}.`;
        valueFallback++;
      }
    }

    const sameValue =
      normalize(card.correctValue) === normalize(resolvedCorrectValue) &&
      normalize(card.explanation) === normalize(resolvedExplanation);

    if (!sameValue || (!card.sourceQuestionId && question?.id)) {
      await prisma.flashcard.update({
        where: { id: card.id },
        data: {
          correctValue: resolvedCorrectValue,
          explanation: resolvedExplanation,
          sourceQuestionId: card.sourceQuestionId || question?.id || null,
        },
      });
      updated++;
    }
  }

  console.log(
    JSON.stringify(
      {
        totalCandidates: cards.length,
        updated,
        sourceMatched,
        stemMatched,
        topicFallback,
        valueFallback,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
