import { Injectable, Logger } from '@nestjs/common';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { SellersService } from '../sellers/sellers.service';

import {
  NotificationPageDto,
  NotificationResponseDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './dto/notification-response.dto';
import { type Recipient, recipientsOf, type RuleEvent } from './notification-rules';
import { NotificationNotFoundError } from './notifications.errors';
import { NotificationsRepository } from './notifications.repository';
import type { PushedNotification } from './realtime-publisher.port';

/** The event types this module turns into notifications. */
export const NOTIFYING_EVENT_TYPES = [
  EVENT_TYPE.SELLER_ORDER_CREATED,
  EVENT_TYPE.SELLER_ORDER_STATUS_CHANGED,
  EVENT_TYPE.SELLER_ORDER_CANCELLED,
  EVENT_TYPE.REFUND_CREATED,
  EVENT_TYPE.AUCTION_CLOSED,
  EVENT_TYPE.AUCTION_WINNER_EXPIRED,
  EVENT_TYPE.SELLER_APPROVED,
  EVENT_TYPE.SELLER_REJECTED,
  EVENT_TYPE.DISPUTE_OPENED,
  EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
  EVENT_TYPE.DISPUTE_RESOLVED,
] as const;

/** A stored notification waiting for its transaction to commit before going out. */
export interface NotificationPush {
  readonly userId: string;
  readonly payload: PushedNotification;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly sellers: SellersService,
  ) {}

  /**
   * Stores one notification per recipient of the event. A recipient who already has one for
   * this event is skipped, so a redelivered event adds nothing. The pushes are returned, not
   * sent: the caller emits them once the storing transaction committed.
   */
  async recordEvent(event: AnyDomainEvent): Promise<NotificationPush[]> {
    const recipients = recipientsOf(event as RuleEvent);
    const pushes: NotificationPush[] = [];
    for (const recipient of recipients) {
      const userId = await this.resolve(recipient);
      if (userId === undefined) {
        continue;
      }
      const stored = await this.notifications.createOnce({
        userId,
        type: event.type,
        payload: { ...event.payload, correlationId: event.correlationId },
        sourceEventId: event.id,
      });
      if (stored) {
        pushes.push({
          userId,
          payload: {
            id: stored.id,
            type: stored.type,
            payload: stored.payload,
            createdAt: stored.createdAt.toISOString(),
          },
        });
        this.logger.log({ msg: 'notification.created', type: event.type, userId });
      }
    }
    return pushes;
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    after?: Date,
  ): Promise<NotificationPageDto> {
    const { items, total } = await this.notifications.list(userId, page, limit, after);
    return { items: items.map((item) => NotificationResponseDto.from(item)), total, page, limit };
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    return { count: await this.notifications.countUnread(userId) };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    if ((await this.notifications.find(id, userId)) === null) {
      throw new NotificationNotFoundError();
    }
    await this.notifications.markRead(id, userId);
    const updated = await this.notifications.find(id, userId);
    if (updated === null) {
      throw new NotificationNotFoundError();
    }
    return NotificationResponseDto.from(updated);
  }

  async markAllRead(userId: string): Promise<ReadAllResultDto> {
    return { updated: await this.notifications.markAllRead(userId) };
  }

  private async resolve(recipient: Recipient): Promise<string | undefined> {
    return recipient.kind === 'user'
      ? recipient.userId
      : this.sellers.findOwnerId(recipient.sellerId);
  }
}
