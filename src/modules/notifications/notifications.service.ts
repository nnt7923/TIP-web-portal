import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { QueryNotificationsDto } from './notifications.dto';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  entityType: true,
  entityId: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationEvent = {
  eventId?: string;
  actorId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  recipients: Prisma.AccountWhereInput[];
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Only accepts a transaction client: the business mutation and its notifications commit together.
  async emit(tx: Prisma.TransactionClient, event: NotificationEvent) {
    if (!event.recipients.length) return;
    const recipients = await tx.account.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: event.actorId },
        OR: event.recipients,
      },
      select: { id: true },
    });
    if (!recipients.length) return;
    const eventId = event.eventId ?? randomUUID();
    await tx.notification.createMany({
      data: [...new Set(recipients.map(({ id }) => id))].map(
        (recipientAccountId) => ({
          recipientAccountId,
          eventId,
          type: event.type,
          title: event.title,
          body: event.body,
          entityType: event.entityType,
          entityId: event.entityId,
        }),
      ),
      skipDuplicates: true,
    });
  }

  async list(accountId: string, query: QueryNotificationsDto) {
    const { page = 1, limit = 20, filter = 'all' } = query;
    const where: Prisma.NotificationWhereInput = {
      recipientAccountId: accountId,
      ...(filter === 'unread' && { readAt: null }),
    };
    const [data, total] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where,
          select: notificationSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.notification.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { data, total, page, limit };
  }

  async unreadCount(accountId: string) {
    return {
      count: await this.prisma.notification.count({
        where: { recipientAccountId: accountId, readAt: null },
      }),
    };
  }

  async read(accountId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, recipientAccountId: accountId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientAccountId: accountId },
      select: notificationSelect,
    });
    if (!notification) throw new NotFoundException('Không tìm thấy thông báo.');
    return notification;
  }

  async readAll(accountId: string, cutoff: Date) {
    // One UPDATE uses a statement snapshot; notifications arriving afterwards stay unread.
    return this.prisma.notification.updateMany({
      where: {
        recipientAccountId: accountId,
        readAt: null,
        createdAt: { lte: cutoff },
      },
      data: { readAt: cutoff },
    });
  }
}
