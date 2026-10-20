import 'reflect-metadata';

import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsString,
  IsTimeZone,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class SeedEnvironment {
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEmail()
  ADMIN_EMAIL!: string;

  @IsString()
  @MinLength(8)
  ADMIN_PASSWORD!: string;

  @IsString()
  @MinLength(8)
  SEED_DEMO_PASSWORD!: string;

  // Read by the demo history, so its sales fall on the same days the analytics reports use.
  @IsTimeZone()
  ANALYTICS_TIMEZONE = 'Europe/Kyiv';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  PLATFORM_COMMISSION_BPS = 1000;
}

export type SeedEnv = Readonly<SeedEnvironment>;

/** Never echoes values: they may be secrets. */
export function parseSeedEnv(raw: Record<string, string | undefined>): SeedEnv {
  const env = plainToInstance(SeedEnvironment, raw, { excludeExtraneousValues: false });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const names = errors.map((error) => error.property);
    throw new Error(`Invalid seed environment, check: ${names.join(', ')}`);
  }
  return env;
}
