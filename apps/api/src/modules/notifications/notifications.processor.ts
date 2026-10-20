import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { NOTIFYING_EVENT_TYPES, NotificationsService } from './notifications.service';

@Processor(QUEUE.NOTIFICATIONS)
export class NotificationsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'notifications';
  protected readonly queue = QUEUE.NOTIFICATIONS;
  protected readonly eventTypes = NOTIFYING_EVENT_TYPES;

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    await this.runIdempotent(event.id, () => this.notifications.recordEvent(event));
  }
}
