import { describe, expect, it } from 'vitest';

import {
  buildProductSchema,
  EMPTY_PRODUCT_FORM,
  toCreateBody,
  type ProductFormValues,
} from './product-schema';

const CATEGORY = '0b6f6a1e-0000-4000-8000-000000000001';

function localInput(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const fixed: ProductFormValues = {
  ...EMPTY_PRODUCT_FORM,
  categoryId: CATEGORY,
  title: 'Lamp',
  description: 'Warm light',
  price: '19.99',
  stock: '5',
};

const auction: ProductFormValues = {
  ...EMPTY_PRODUCT_FORM,
  type: 'AUCTION',
  categoryId: CATEGORY,
  title: 'Vase',
  description: 'Old vase',
  startPrice: '10',
  bidStep: '1.50',
  endsAt: localInput(2 * 60 * 60 * 1000),
};

function errorsOf(values: ProductFormValues, mode: 'create' | 'edit' = 'create') {
  const result = buildProductSchema(mode).safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
}

describe('product form schema', () => {
  it('accepts a complete fixed-price product and converts money to cents', () => {
    expect(errorsOf(fixed)).toEqual([]);
    expect(toCreateBody(fixed)).toMatchObject({
      type: 'FIXED_PRICE',
      priceCents: 1999,
      stock: 5,
    });
  });

  it('rejects a fixed-price product without price, with a bad stock, or without a category', () => {
    expect(errorsOf({ ...fixed, price: '', stock: '-1', categoryId: '' })).toEqual(
      expect.arrayContaining(['price', 'stock', 'categoryId']),
    );
  });

  it('accepts a complete auction and builds the auction terms', () => {
    expect(errorsOf(auction)).toEqual([]);
    expect(toCreateBody(auction)).toMatchObject({
      type: 'AUCTION',
      startPriceCents: 1000,
      bidStepCents: 150,
    });
  });

  it('rejects auction terms that are missing or outside the allowed duration', () => {
    expect(errorsOf({ ...auction, startPrice: '', bidStep: '0' })).toEqual(
      expect.arrayContaining(['startPrice', 'bidStep']),
    );
    expect(errorsOf({ ...auction, endsAt: localInput(10_000) })).toContain('endsAt');
    expect(errorsOf({ ...auction, endsAt: localInput(31 * 24 * 3600 * 1000) })).toContain('endsAt');
  });

  it('limits and validates image URLs', () => {
    expect(errorsOf({ ...fixed, images: 'not a url' })).toContain('images');
    expect(
      errorsOf({ ...fixed, images: Array(6).fill('https://a.co/x.png').join('\n') }),
    ).toContain('images');
    expect(errorsOf({ ...fixed, images: 'https://a.co/x.png' })).toEqual([]);
  });

  it('does not ask for stock or auction terms when editing', () => {
    expect(errorsOf({ ...fixed, stock: '' }, 'edit')).toEqual([]);
    expect(errorsOf({ ...auction, startPrice: '', endsAt: '' }, 'edit')).toEqual([]);
  });
});
