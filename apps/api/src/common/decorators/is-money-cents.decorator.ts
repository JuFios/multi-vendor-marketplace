import { applyDecorators } from '@nestjs/common';
import { IsInt, Max, Min, type ValidationOptions } from 'class-validator';

/** Per-amount cap; keeps sums of many lines inside the 32-bit integer columns. */
export const MAX_MONEY_CENTS = 100_000_000;

export interface IsMoneyCentsOptions extends ValidationOptions {
  max?: number;
}

/** Money is a positive whole number of cents, never a float. */
export function IsMoneyCents({
  max = MAX_MONEY_CENTS,
  ...validation
}: IsMoneyCentsOptions = {}): PropertyDecorator {
  return applyDecorators(IsInt(validation), Min(1, validation), Max(max, validation));
}
