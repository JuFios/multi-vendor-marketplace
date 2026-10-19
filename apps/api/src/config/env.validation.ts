import 'reflect-metadata';

import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  ValidateIf,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

// An empty value in an env file means "not configured".
const EmptyAsUndefined = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value));

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  // Browser origin of the SPA; the only origin CORS lets in.
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  WEB_URL = 'http://localhost:5173';

  // Number of reverse-proxy hops in front of the api (0 = none, 1 = nginx).
  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY = 0;

  // Maximum request body size, e.g. `100kb`.
  @Matches(/^\d+(b|kb|mb)$/i)
  BODY_LIMIT = '100kb';

  // 0 lets the OS pick a free port (tests).
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65_535)
  WORKER_METRICS_PORT = 9100;

  // HS256 key of the access tokens; 32+ characters keeps it out of brute-force range.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_ACCESS_TTL_SEC = 900;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 30;

  // Secure attribute of the auth cookies; unset means "on in production, off elsewhere".
  @EmptyAsUndefined()
  @IsOptional()
  @IsIn(['true', 'false'])
  COOKIE_SECURE?: string;

  // Google sign-in is on when GOOGLE_CLIENT_ID is set; the other two are then required.
  @EmptyAsUndefined()
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @EmptyAsUndefined()
  @ValidateIf((env: EnvironmentVariables) => env.GOOGLE_CLIENT_ID !== undefined)
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET?: string;

  @EmptyAsUndefined()
  @ValidateIf((env: EnvironmentVariables) => env.GOOGLE_CLIENT_ID !== undefined)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  GOOGLE_CALLBACK_URL?: string;

  // How often the worker polls the outbox, and how many events it relays per batch.
  @Type(() => Number)
  @IsInt()
  @Min(10)
  OUTBOX_POLL_INTERVAL_MS = 200;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  OUTBOX_BATCH_SIZE = 100;

  // Jobs a queue worker processes at the same time.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  QUEUE_CONCURRENCY = 5;

  // How long a stored Idempotency-Key response stays valid, and after how many seconds an
  // unfinished request is treated as abandoned.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_TTL_HOURS = 24;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_LOCK_TIMEOUT_SEC = 30;

  // Rate limits: requests per window; TTL is the window length in seconds.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_DEFAULT_LIMIT = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_DEFAULT_TTL = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LOGIN_LIMIT = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LOGIN_TTL = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_REGISTER_LIMIT = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_REGISTER_TTL = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_REFRESH_LIMIT = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_REFRESH_TTL = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_BID_LIMIT = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_BID_TTL = 10;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_protocol: true, require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_protocol: true, require_tld: false })
  REDIS_URL!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  MEILI_HOST!: string;

  @IsString()
  @MinLength(16)
  MEILI_MASTER_KEY!: string;

  // Prepended to every index name so profiles never share indexes.
  @Matches(/^[A-Za-z0-9_]*$/)
  MEILI_INDEX_PREFIX = '';
}

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'InvalidEnvironmentError';
  }
}

/** Fails fast on a missing or invalid variable. Never echoes values: they may be secrets. */
export function validate(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new InvalidEnvironmentError(
      errors.map((error) =>
        raw[error.property] === undefined
          ? `${error.property}: is required`
          : `${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`,
      ),
    );
  }
  return env;
}

export function loadEnv(): EnvironmentVariables {
  return validate(process.env);
}
