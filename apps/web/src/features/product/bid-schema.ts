import { z } from 'zod';

import { dollarsToCents, formatMoney } from '../../lib/money';

export function bidSchema(minimumCents: number) {
  return z.object({
    amount: z
      .string()
      .trim()
      .superRefine((value, context) => {
        const cents = dollarsToCents(value);
        if (cents === null) {
          context.addIssue({ code: 'custom', message: 'Enter an amount like 125.50' });
        } else if (cents < minimumCents) {
          context.addIssue({
            code: 'custom',
            message: `Minimum bid is ${formatMoney(minimumCents)}`,
          });
        }
      }),
  });
}
