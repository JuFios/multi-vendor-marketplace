import { getContextUserId, getCorrelationId } from '../../common/cls/correlation-context';

import { newEventId } from './event-id';
import type { EventPayloads, EventType } from './event-types';

export const EVENT_SCHEMA_VERSION = 1;

/** The envelope every consumer receives; also the BullMQ job data. */
export interface DomainEvent<TType extends EventType = EventType, TPayload = EventPayloads[TType]> {
  /** UUID v7: the BullMQ jobId and the inbox key. */
  id: string;
  type: TType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  correlationId: string | null;
  actorId: string | null;
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  payload: TPayload;
}

/** Any event type, each paired with its own payload. */
export type AnyDomainEvent = { [T in EventType]: DomainEvent<T> }[EventType];

/** What a use case hands to the outbox. */
export interface NewDomainEvent<TType extends EventType = EventType> {
  type: TType;
  aggregateType: string;
  aggregateId: string;
  payload: EventPayloads[TType];
  /** Defaults to the authenticated user of the current context; `null` marks a system event. */
  actorId?: string | null;
}

/** Any event type, each paired with its own payload; what `OutboxService.add` accepts. */
export type AnyNewDomainEvent = { [T in EventType]: NewDomainEvent<T> }[EventType];

/** A new event with its identity fixed; `occurredAt` is assigned by the database on insert. */
export interface DomainEventDraft<TType extends EventType = EventType> {
  id: string;
  type: TType;
  aggregateType: string;
  aggregateId: string;
  payload: EventPayloads[TType];
  correlationId: string | null;
  actorId: string | null;
}

/** Stamps the correlation id and actor of the current CLS context onto a new event. */
export function createDomainEventDraft<TType extends EventType>(
  event: NewDomainEvent<TType>,
): DomainEventDraft<TType> {
  return {
    id: newEventId(),
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    correlationId: getCorrelationId() ?? null,
    actorId: event.actorId === undefined ? (getContextUserId() ?? null) : event.actorId,
  };
}
