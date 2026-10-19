import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { Prisma } from '../generated/prisma/client';
import type { AppTransactionHost } from '../prisma';

import { type AnyNewDomainEvent, createDomainEventDraft } from './events';
import { OutboxOutsideTransactionError } from './outbox.errors';

@Injectable()
export class OutboxService {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /**
   * Records events in the current transaction, so they exist exactly when the state change does.
   * Returns the event ids in the order given.
   */
  async add(events: readonly AnyNewDomainEvent[]): Promise<string[]> {
    if (!this.txHost.isTransactionActive()) {
      throw new OutboxOutsideTransactionError();
    }
    const drafts = events.map((event) => createDomainEventDraft(event));
    if (drafts.length === 0) {
      return [];
    }
    await this.txHost.tx.outboxEvent.createMany({
      data: drafts.map((draft) => ({
        id: draft.id,
        eventType: draft.type,
        aggregateType: draft.aggregateType,
        aggregateId: draft.aggregateId,
        payload: draft.payload as unknown as Prisma.InputJsonObject,
        correlationId: draft.correlationId,
        actorId: draft.actorId,
      })),
    });
    return drafts.map(({ id }) => id);
  }
}
