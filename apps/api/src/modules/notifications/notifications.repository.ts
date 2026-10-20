import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { Notification as NotificationRow } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { NewNotification, Notification } from './notification';

const toNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  userId: row.userId,
  type: row.type,
  payload: row.payload,
  readAt: row.readAt,
  createdAt: row.createdAt,
});

/** Owns `notifications`; every read and change is scoped to the user it belongs to. */
@Injectable()
export class NotificationsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /**
   * Stores the notification unless this user already got one for the event. Returns the stored
   * row, or null for a duplicate.
   */
  async createOnce(notification: NewNotification): Promise<Notification | null> {
    const { count } = await this.txHost.tx.notification.createMany({
      data: [{ ...notification, payload: notification.payload }],
      skipDuplicates: true,
    });
    if (count === 0) {
      return null;
    }
    const row = await this.txHost.tx.notification.findUniqueOrThrow({
      where: {
        userId_sourceEventId: {
          userId: notification.userId,
          sourceEventId: notification.sourceEventId,
        },
      },
    });
    return toNotification(row);
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Notification[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.txHost.tx.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.notification.count({ where: { userId } }),
    ]);
    return { items: rows.map(toNotification), total };
  }

  countUnread(userId: string): Promise<number> {
    return this.txHost.tx.notification.count({ where: { userId, readAt: null } });
  }

  async find(id: string, userId: string): Promise<Notification | null> {
    const row = await this.txHost.tx.notification.findFirst({ where: { id, userId } });
    return row && toNotification(row);
  }

  /** Marks one notification read; a notification that was already read keeps its first time. */
  async markRead(id: string, userId: string): Promise<void> {
    await this.txHost.tx.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.txHost.tx.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
