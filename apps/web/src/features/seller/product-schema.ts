import { z } from 'zod';

import { dollarsToCents } from '../../lib/money';

import type { CreateProductBody, UpdateProductBody } from './seller-api';

export const MIN_AUCTION_MS = 60_000;
export const MAX_AUCTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 5;

export interface ProductFormValues {
  type: 'FIXED_PRICE' | 'AUCTION';
  categoryId: string;
  title: string;
  description: string;
  /** One image URL per line. */
  images: string;
  price: string;
  stock: string;
  startPrice: string;
  bidStep: string;
  /** `datetime-local` value in the seller's time zone. */
  endsAt: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  type: 'FIXED_PRICE',
  categoryId: '',
  title: '',
  description: '',
  images: '',
  price: '',
  stock: '',
  startPrice: '',
  bidStep: '',
  endsAt: '',
};

export function parseImageLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** `create` also needs the stock or auction terms; they are fixed or edited elsewhere afterwards. */
export function buildProductSchema(mode: 'create' | 'edit') {
  return z
    .object({
      type: z.enum(['FIXED_PRICE', 'AUCTION']),
      categoryId: z.string().min(1, 'Choose a category'),
      title: z.string().trim().min(1, 'Enter a title').max(200),
      description: z.string().trim().min(1, 'Enter a description').max(5000),
      images: z.string(),
      price: z.string(),
      stock: z.string(),
      startPrice: z.string(),
      bidStep: z.string(),
      endsAt: z.string(),
    })
    .superRefine((value, context) => {
      const fail = (path: keyof ProductFormValues, message: string) => {
        context.addIssue({ code: 'custom', path: [path], message });
      };

      const images = parseImageLines(value.images);
      if (images.length > MAX_IMAGES) {
        fail('images', `At most ${MAX_IMAGES} images`);
      } else if (images.some((image) => !isHttpUrl(image))) {
        fail('images', 'Each line must be a http(s) URL');
      }

      if (value.type === 'FIXED_PRICE') {
        const price = dollarsToCents(value.price);
        if (price === null || price < 1) {
          fail('price', 'Enter a price like 19.99');
        }
        if (mode === 'create') {
          const stock = Number(value.stock);
          if (
            value.stock.trim() === '' ||
            !Number.isInteger(stock) ||
            stock < 0 ||
            stock > 1_000_000
          ) {
            fail('stock', 'Enter a whole number from 0 to 1,000,000');
          }
        }
        return;
      }

      if (mode === 'edit') {
        return;
      }
      const start = dollarsToCents(value.startPrice);
      if (start === null || start < 1) {
        fail('startPrice', 'Enter a starting price like 10.00');
      }
      const step = dollarsToCents(value.bidStep);
      if (step === null || step < 1) {
        fail('bidStep', 'Enter a bid step like 1.00');
      }
      const endsAt = Date.parse(value.endsAt);
      const until = endsAt - Date.now();
      if (Number.isNaN(endsAt)) {
        fail('endsAt', 'Choose when the auction ends');
      } else if (until < MIN_AUCTION_MS) {
        fail('endsAt', 'The auction must last at least one minute');
      } else if (until > MAX_AUCTION_MS) {
        fail('endsAt', 'The auction can last at most 30 days');
      }
    });
}

export function toCreateBody(values: ProductFormValues): CreateProductBody {
  const images = parseImageLines(values.images);
  const common = {
    categoryId: values.categoryId,
    title: values.title.trim(),
    description: values.description.trim(),
    ...(images.length > 0 && { images }),
  };
  if (values.type === 'FIXED_PRICE') {
    return {
      ...common,
      type: 'FIXED_PRICE',
      priceCents: dollarsToCents(values.price) ?? 0,
      stock: Number(values.stock),
    };
  }
  return {
    ...common,
    type: 'AUCTION',
    startPriceCents: dollarsToCents(values.startPrice) ?? 0,
    bidStepCents: dollarsToCents(values.bidStep) ?? 0,
    endsAt: new Date(values.endsAt).toISOString(),
  };
}

export function toUpdateBody(values: ProductFormValues): UpdateProductBody {
  return {
    categoryId: values.categoryId,
    title: values.title.trim(),
    description: values.description.trim(),
    images: parseImageLines(values.images),
    ...(values.type === 'FIXED_PRICE' && { priceCents: dollarsToCents(values.price) ?? 0 }),
  };
}
