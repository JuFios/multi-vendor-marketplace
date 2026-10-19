import { createHash, randomBytes } from 'node:crypto';

export interface NewRefreshToken {
  /** Sent to the client once; never stored. */
  readonly token: string;
  /** What the database keeps: a leaked table reveals no usable token. */
  readonly tokenHash: string;
}

/** 256 random bits, URL-safe. */
const TOKEN_BYTES = 32;

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export function newRefreshToken(): NewRefreshToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}
