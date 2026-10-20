import { Processor } from '@nestjs/bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { REALTIME_EVENT_TYPES } from './realtime-projection';
import { RealtimeService } from './realtime.service';

/** No inbox: a push is harmless to repeat, since clients ignore versions they already have. */
@Processor(QUEUE.REALTIME)
export class RealtimeProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'realtime';
  protected readonly queue = QUEUE.REALTIME;
  protected readonly eventTypes = REALTIME_EVENT_TYPES;

  constructor(private readonly realtime: RealtimeService) {
    super();
  }

  protected handle(event: AnyDomainEvent): Promise<void> {
    return this.realtime.publish(event);
  }
}
