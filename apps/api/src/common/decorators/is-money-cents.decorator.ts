import { applyDecorators } from '@nestjs/common';
import { IsInt, Max, Min, type ValidationOptions } from 'class-validator';

import { MAX_MONEY_CENTS } from '../money';

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
