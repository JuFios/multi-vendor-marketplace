export interface IdempotencyLease {
  id: string;
  /** Doubles as the owner token: a takeover moves it, which fences the previous owner out. */
  createdAt: Date;
}

/** What the interceptor leaves in CLS for the use case's `IdempotencyService.complete`. */
export interface IdempotencyContext {
  lease: IdempotencyLease;
  statusCode: number;
  completed: boolean;
}

declare module 'nestjs-cls' {
  interface ClsStore {
    idempotency?: IdempotencyContext;
  }
}
