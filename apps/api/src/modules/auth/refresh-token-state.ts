export interface StoredRefreshTokenState {
  readonly revokedAt: Date | null;
  /** Computed by the database clock, like every other deadline. */
  readonly expired: boolean;
}

/**
 * - `unknown`: no such token;
 * - `reused`: already rotated or revoked, so whoever presents it now may be a thief: the whole family is dead;
 * - `expired`: simply too old, nothing suspicious;
 * - `active`: may be exchanged for a new one.
 */
export type RefreshTokenVerdict = 'unknown' | 'reused' | 'expired' | 'active';

export function judgeRefreshToken(token: StoredRefreshTokenState | null): RefreshTokenVerdict {
  if (token === null) {
    return 'unknown';
  }
  if (token.revokedAt !== null) {
    return 'reused';
  }
  return token.expired ? 'expired' : 'active';
}
