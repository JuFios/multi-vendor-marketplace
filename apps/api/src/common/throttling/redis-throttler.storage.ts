import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Counter } from '@prometheus-io/client';
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'throttle:';

// Fixed window with a block: the hit that exceeds the limit starts a block that outlives the
// window, and hits during a block are not counted. One script keeps INCR/EXPIRE/SET atomic.
const HIT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {current, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

type HitResult = [hits: number, ttlMs: number, blocked: number, blockTtlMs: number];

const toSeconds = (ms: number): number => Math.ceil(ms / 1000);

/** Shared by every api instance, so limits hold regardless of which one serves the request. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    private readonly redis: Redis,
    private readonly failures: Counter<string>,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${KEY_PREFIX}${throttlerName}:${key}`;
    try {
      const [totalHits, ttlMs, blocked, blockTtlMs] = (await this.redis.eval(
        HIT_SCRIPT,
        2,
        base,
        `${base}:block`,
        ttl,
        limit,
        blockDuration,
      )) as HitResult;

      return {
        totalHits,
        timeToExpire: toSeconds(ttlMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockTtlMs),
      };
    } catch (error) {
      // Fail open: the limiter protects the API, it must not take it down with its storage.
      // The counter keeps the blind spot visible while Redis is unreachable.
      this.failures.inc();
      this.logger.error({
        msg: 'throttle.storage_failed',
        throttler: throttlerName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalHits: 1,
        timeToExpire: toSeconds(ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
