import type { Queue } from 'bullmq';

import type { AnyDomainEvent } from '../outbox/events';

import type { QueueName } from './queue-names';
import type { QueuePublisherPort } from './queue-publisher.port';

export class BullMqQueuePublisher implements QueuePublisherPort {
  constructor(private readonly queues: ReadonlyMap<QueueName, Queue>) {}

  async publish(queue: QueueName, event: AnyDomainEvent): Promise<void> {
    const target = this.queues.get(queue);
    if (!target) {
      throw new Error(`queue "${queue}" is not registered`);
    }
    // The event id as jobId makes a repeated publication a no-op while the job still exists.
    await target.add(event.type, event, { jobId: event.id });
  }
}
