import 'reflect-metadata';

import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

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
