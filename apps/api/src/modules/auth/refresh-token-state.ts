export interface StoredRefreshTokenState {
  readonly revokedAt: Date | null;
  /** Set only by rotation: `null` on a revoked token means it was revoked in place. */
  readonly replacedById: string | null;
  /** Computed by the database clock, like every other deadline. */
  readonly expired: boolean;
}

/**
 * - `unknown`: no such token;
 * - `reused`: already rotated, so whoever presents it now may be a thief: the whole family is dead;
 * - `revoked`: revoked in place, by logout or by an earlier reuse detection; nothing to act on;
 * - `expired`: simply too old, nothing suspicious;
 * - `active`: may be exchanged for a new one.
 */
export type RefreshTokenVerdict = 'unknown' | 'reused' | 'revoked' | 'expired' | 'active';

export function judgeRefreshToken(token: StoredRefreshTokenState | null): RefreshTokenVerdict {
  if (token === null) {
    return 'unknown';
  }
  if (token.revokedAt !== null) {
    return token.replacedById === null ? 'revoked' : 'reused';
  }
  return token.expired ? 'expired' : 'active';
}
