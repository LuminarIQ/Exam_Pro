import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.subject.findMany({
      where: { tenantId },
      include: { chapters: { include: { topics: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createSubject(tenantId: string, name: string) {
    return this.prisma.subject.create({ data: { tenantId, name } });
  }

  createChapter(tenantId: string, subjectId: string, name: string) {
    return this.prisma.chapter.create({ data: { tenantId, subjectId, name } });
  }

  createTopic(tenantId: string, chapterId: string, name: string) {
    return this.prisma.topic.create({ data: { tenantId, chapterId, name } });
  }

  createPrerequisite(tenantId: string, topicId: string, prerequisiteTopicId: string) {
    return this.prisma.topicPrerequisite.create({
      data: { tenantId, topicId, prerequisiteTopicId },
    });
  }

  updateName(
    tenantId: string,
    entity: 'subject' | 'chapter' | 'topic',
    id: string,
    name: string,
  ) {
    if (entity === 'subject') {
      return this.prisma.subject.updateMany({ where: { id, tenantId }, data: { name } });
    }
    if (entity === 'chapter') {
      return this.prisma.chapter.updateMany({ where: { id, tenantId }, data: { name } });
    }
    return this.prisma.topic.updateMany({ where: { id, tenantId }, data: { name } });
  }

  remove(tenantId: string, entity: 'subject' | 'chapter' | 'topic', id: string) {
    if (entity === 'subject') {
      return this.prisma.subject.deleteMany({ where: { id, tenantId } });
    }
    if (entity === 'chapter') {
      return this.prisma.chapter.deleteMany({ where: { id, tenantId } });
    }
    return this.prisma.topic.deleteMany({ where: { id, tenantId } });
  }
}
