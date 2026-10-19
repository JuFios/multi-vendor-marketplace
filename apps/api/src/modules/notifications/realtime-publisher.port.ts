export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

export interface PushedNotification {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

/** Pushes a freshly stored notification to the user's open connections. */
export interface RealtimePublisherPort {
  notifyUser(userId: string, notification: PushedNotification): Promise<void>;
}
