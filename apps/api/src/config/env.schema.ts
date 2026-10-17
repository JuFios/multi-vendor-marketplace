import { z } from 'zod';

const positiveInt = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

const urlWithProtocol = (protocols: RegExp) => z.url({ protocol: protocols });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_URL: urlWithProtocol(/^https?$/).default('http://localhost:5173'),
  // Number of reverse proxies in front of the api whose X-Forwarded-For is trusted.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(b|kb|mb)$/i)
    .default('100kb'),

  THROTTLE_DEFAULT_LIMIT: positiveInt(100),
  THROTTLE_DEFAULT_TTL: positiveInt(60),
  THROTTLE_LOGIN_LIMIT: positiveInt(5),
  THROTTLE_LOGIN_TTL: positiveInt(60),
  THROTTLE_REGISTER_LIMIT: positiveInt(10),
  THROTTLE_REGISTER_TTL: positiveInt(60),
  THROTTLE_REFRESH_LIMIT: positiveInt(30),
  THROTTLE_REFRESH_TTL: positiveInt(60),
  THROTTLE_BID_LIMIT: positiveInt(10),
  THROTTLE_BID_TTL: positiveInt(10),

  // 0 lets the OS pick a free port (tests).
  WORKER_METRICS_PORT: z.coerce.number().int().min(0).max(65_535).default(9100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: urlWithProtocol(/^postgres(ql)?$/),
  REDIS_URL: urlWithProtocol(/^rediss?$/),

  MEILI_HOST: urlWithProtocol(/^https?$/),
  MEILI_MASTER_KEY: z.string().min(16),
  MEILI_INDEX_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_]*$/)
    .default(''),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'InvalidEnvironmentError';
  }
}

/** Never echoes values: they may be secrets. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  throw new InvalidEnvironmentError(
    result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      return raw[name] === undefined ? `${name}: is required` : `${name}: ${issue.message}`;
    }),
  );
}
