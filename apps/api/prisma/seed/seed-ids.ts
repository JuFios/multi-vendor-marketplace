import { createHash } from 'node:crypto';

/** Deterministic UUID (v5 layout), so re-running the seed addresses the same rows. */
export function seedId(key: string): string {
  const bytes = createHash('sha1').update(`marketplace-seed:${key}`).digest();
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
