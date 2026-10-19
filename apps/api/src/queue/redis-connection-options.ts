import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ opens its own connections (a worker needs a blocking one of its own), so it takes
 * connection options rather than a shared client. `maxRetriesPerRequest: null` is mandatory
 * for workers.
 */
export function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const db = Number(url.pathname.slice(1));
  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
    ...(Number.isInteger(db) && db > 0 ? { db } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
