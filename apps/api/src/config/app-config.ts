import type { Env } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface ThrottleRule {
  readonly limit: number;
  readonly ttlMs: number;
}

export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly http: {
    readonly port: number;
    readonly trustProxy: number;
    readonly bodyLimit: string;
  };
  /** Browser origin of the SPA (scheme + host + port), used for CORS and redirects. */
  readonly web: { readonly origin: string };
  readonly throttle: {
    readonly default: ThrottleRule;
    readonly login: ThrottleRule;
    readonly register: ThrottleRule;
    readonly refresh: ThrottleRule;
    readonly bid: ThrottleRule;
  };
  readonly metrics: { readonly workerPort: number };
  readonly logging: { readonly level: Env['LOG_LEVEL'] };
  readonly database: { readonly url: string };
  readonly redis: { readonly url: string };
  readonly meili: {
    readonly host: string;
    readonly masterKey: string;
    readonly indexPrefix: string;
  };
}

const rule = (limit: number, ttlSeconds: number): ThrottleRule => ({
  limit,
  ttlMs: ttlSeconds * 1000,
});

export function buildAppConfig(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    http: { port: env.PORT, trustProxy: env.TRUST_PROXY, bodyLimit: env.BODY_LIMIT },
    web: { origin: new URL(env.WEB_URL).origin },
    throttle: {
      default: rule(env.THROTTLE_DEFAULT_LIMIT, env.THROTTLE_DEFAULT_TTL),
      login: rule(env.THROTTLE_LOGIN_LIMIT, env.THROTTLE_LOGIN_TTL),
      register: rule(env.THROTTLE_REGISTER_LIMIT, env.THROTTLE_REGISTER_TTL),
      refresh: rule(env.THROTTLE_REFRESH_LIMIT, env.THROTTLE_REFRESH_TTL),
      bid: rule(env.THROTTLE_BID_LIMIT, env.THROTTLE_BID_TTL),
    },
    metrics: { workerPort: env.WORKER_METRICS_PORT },
    logging: { level: env.LOG_LEVEL },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    meili: {
      host: env.MEILI_HOST,
      masterKey: env.MEILI_MASTER_KEY,
      indexPrefix: env.MEILI_INDEX_PREFIX,
    },
  };
}
