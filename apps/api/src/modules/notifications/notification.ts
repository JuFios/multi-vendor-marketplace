export interface Notification {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NewNotification {
  readonly userId: string;
  readonly type: string;
  readonly payload: object;
  readonly sourceEventId: string;
}
