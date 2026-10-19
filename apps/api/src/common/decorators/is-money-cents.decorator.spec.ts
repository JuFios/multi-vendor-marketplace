import { validate } from 'class-validator';

import { IsMoneyCents, MAX_MONEY_CENTS } from './is-money-cents.decorator';

class Priced {
  @IsMoneyCents()
  priceCents: unknown;
}

class Capped {
  @IsMoneyCents({ max: 500 })
  amountCents: unknown;
}

async function isValid(Type: new () => object, key: string, value: unknown): Promise<boolean> {
  const target = Object.assign(new Type(), { [key]: value });
  return (await validate(target)).length === 0;
}

describe('IsMoneyCents', () => {
  it.each([1, 1999, MAX_MONEY_CENTS])('accepts %s', async (value) => {
    expect(await isValid(Priced, 'priceCents', value)).toBe(true);
  });

  it.each([0, -5, 10.5, MAX_MONEY_CENTS + 1, '100', null, undefined, Number.NaN])(
    'rejects %p',
    async (value) => {
      expect(await isValid(Priced, 'priceCents', value)).toBe(false);
    },
  );

  it('honours a custom maximum', async () => {
    expect(await isValid(Capped, 'amountCents', 500)).toBe(true);
    expect(await isValid(Capped, 'amountCents', 501)).toBe(false);
  });
});
