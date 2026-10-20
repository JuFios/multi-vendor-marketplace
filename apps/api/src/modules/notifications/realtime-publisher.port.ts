import type { WsEventName } from './ws-events';

export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

export interface PushedNotification {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

/** Pushes events to the connections that follow a room; rejects when the push could not be sent. */
export interface RealtimePublisherPort {
  emit(room: string, event: WsEventName, payload: object): Promise<void>;
  /** Pushes a freshly stored notification to the user's open connections. */
  notifyUser(userId: string, notification: PushedNotification): Promise<void>;
}
