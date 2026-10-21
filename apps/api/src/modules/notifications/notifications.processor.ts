import { Processor } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import {
  NOTIFYING_EVENT_TYPES,
  type NotificationPush,
  NotificationsService,
} from './notifications.service';
import { REALTIME_PUBLISHER, type RealtimePublisherPort } from './realtime-publisher.port';

@Processor(QUEUE.NOTIFICATIONS)
export class NotificationsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'notifications';
  protected readonly queue = QUEUE.NOTIFICATIONS;
  protected readonly eventTypes = NOTIFYING_EVENT_TYPES;

  constructor(
    private readonly notifications: NotificationsService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisherPort,
  ) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    let pushes: NotificationPush[] = [];
    const stored = await this.runIdempotent(event.id, async () => {
      pushes = await this.notifications.recordEvent(event);
    });
    // After the commit: a rolled-back transaction must not have announced anything.
    if (stored) {
      for (const push of pushes) {
        await this.realtime.notifyUser(push.userId, push.payload);
      }
    }
  }
}
