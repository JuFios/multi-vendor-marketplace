import { z } from 'zod';

import { dollarsToCents, formatMoney } from '../../lib/money';

/** The api refuses any single amount above this (1 000 000.00). */
export const MAX_BID_CENTS = 100_000_000;

export function bidSchema(minimumCents: number) {
  return z.object({
    amount: z
      .string()
      .trim()
      .superRefine((value, context) => {
        const cents = dollarsToCents(value);
        if (cents === null) {
          context.addIssue({ code: 'custom', message: 'Enter an amount like 125.50' });
        } else if (cents > MAX_BID_CENTS) {
          context.addIssue({
            code: 'custom',
            message: `Maximum bid is ${formatMoney(MAX_BID_CENTS)}`,
          });
        } else if (cents < minimumCents) {
          context.addIssue({
            code: 'custom',
            message: `Minimum bid is ${formatMoney(minimumCents)}`,
          });
        }
      }),
  });
}
