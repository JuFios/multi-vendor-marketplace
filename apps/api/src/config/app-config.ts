import type { Env } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly http: { readonly port: number };
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

export function buildAppConfig(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    http: { port: env.PORT },
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
