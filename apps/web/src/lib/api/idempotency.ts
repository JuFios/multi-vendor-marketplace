export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Holds one key for a user action so a retry of that action reuses it. */
export class IdempotencySession {
  private key: string | null = null;

  current(): string {
    this.key ??= createIdempotencyKey();
    return this.key;
  }

  reset(): void {
    this.key = null;
  }
}
