import type { AnyDomainEvent } from '../outbox/events/domain-event';

import type { QueueName } from './queue-names';

export const QUEUE_PUBLISHER = Symbol('QUEUE_PUBLISHER');

/** Hands an event to one consumer queue; the queue technology stays behind this port. */
export interface QueuePublisherPort {
  /** Publishing the same event twice must not create a second job. */
  publish(queue: QueueName, event: AnyDomainEvent): Promise<void>;
}
