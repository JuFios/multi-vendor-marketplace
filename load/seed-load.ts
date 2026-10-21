/**
 * Prepares one load-test run through the public API: buyers with access tokens, an auction that
 * ends in a few minutes and a fixed-price product with limited stock. Safe to repeat: accounts are
 * reused, the lots are created anew.
 */
import { writeFile } from 'node:fs/promises';

import { FIXTURE_FILE, type Fixture, type FixtureBuyer } from './lib/fixture';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const BUYER_COUNT = intFromEnv('LOAD_BUYERS', 500);
const STOCK = intFromEnv('LOAD_STOCK', 100);
const AUCTION_MINUTES = intFromEnv('LOAD_AUCTION_MINUTES', 10);
const SIGN_IN_CONCURRENCY = intFromEnv('LOAD_SIGN_IN_CONCURRENCY', 8);

const SELLER_EMAIL = process.env.LOAD_SELLER_EMAIL ?? 'seller1@example.com';
const SELLER_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'change-me-demo';
// Throwaway accounts of the load profile; the password only has to satisfy the password policy.
const BUYER_PASSWORD = 'Load-test-pass-1';

const AUCTION_START_PRICE_CENTS = 10_000;
const AUCTION_BID_STEP_CENTS = 100;
const STOCK_PRODUCT_PRICE_CENTS = 2_500;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

interface ApiResponse<T> {
  status: number;
  body: T;
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T };
}

function expectStatus<T>(response: ApiResponse<T>, what: string, ...allowed: number[]): T {
  if (!allowed.includes(response.status)) {
    throw new Error(
      `${what}: unexpected status ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`,
    );
  }
  return response.body;
}

async function signIn(email: string, password: string, what: string): Promise<string> {
  const response = await call<{ accessToken: string }>('POST', '/api/auth/login', {
    body: { email, password },
  });
  return expectStatus(response, `${what} sign-in`, 200).accessToken;
}

async function ensureBuyer(index: number): Promise<FixtureBuyer> {
  const email = `load-buyer-${index}@example.com`;
  const registered = await call('POST', '/api/auth/register', {
    body: { email, password: BUYER_PASSWORD, name: `Load Buyer ${index}` },
  });
  // 409: the account exists from an earlier run.
  expectStatus(registered, `register ${email}`, 201, 409);
  return { email, token: await signIn(email, BUYER_PASSWORD, email) };
}

async function mapWithConcurrency<R>(
  count: number,
  size: number,
  task: (index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(count);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < count; index = next++) {
      results[index] = await task(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, count) }, worker));
  return results;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const ready = await fetch(`${API_URL}/api/health/ready`).then(
      (response) => response.ok,
      () => false,
    );
    if (ready) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`${API_URL} is not ready; is the stack up?`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function main(): Promise<void> {
  console.log(`seed-load: ${API_URL}, ${BUYER_COUNT} buyers, stock ${STOCK}`);
  await waitForApi();

  const sellerToken = await signIn(SELLER_EMAIL, SELLER_PASSWORD, 'seller').catch(
    (error: unknown) => {
      throw new Error(
        'Cannot sign in as the demo seller; check that the database is seeded and ' +
          'SEED_DEMO_PASSWORD matches it',
        { cause: error },
      );
    },
  );

  const categories = expectStatus(
    await call<{ id: string }[]>('GET', '/api/categories'),
    'list categories',
    200,
  );
  const categoryId = categories[0]?.id;
  if (categoryId === undefined) {
    throw new Error('No categories: run the database seed first');
  }

  const endsAt = new Date(Date.now() + AUCTION_MINUTES * 60_000).toISOString();
  const auction = expectStatus(
    await call<{ id: string; auctionId: string | null }>('POST', '/api/seller/products', {
      token: sellerToken,
      body: {
        type: 'AUCTION',
        categoryId,
        title: 'Load test auction',
        description: 'Lot that many bidders race for during the load test.',
        startPriceCents: AUCTION_START_PRICE_CENTS,
        bidStepCents: AUCTION_BID_STEP_CENTS,
        endsAt,
      },
    }),
    'create auction',
    201,
  );
  if (auction.auctionId === null) {
    throw new Error('The auction product came back without an auction id');
  }

  const stockProduct = expectStatus(
    await call<{ id: string; isPublished: boolean }>('POST', '/api/seller/products', {
      token: sellerToken,
      body: {
        type: 'FIXED_PRICE',
        categoryId,
        title: 'Load test limited stock item',
        description: 'Limited stock that many buyers check out at the same moment.',
        priceCents: STOCK_PRODUCT_PRICE_CENTS,
        stock: STOCK,
      },
    }),
    'create stock product',
    201,
  );
  if (!stockProduct.isPublished) {
    throw new Error('The stock product is not published; set PRODUCT_PREMODERATION=false');
  }

  const buyers = await mapWithConcurrency(BUYER_COUNT, SIGN_IN_CONCURRENCY, (index) =>
    ensureBuyer(index + 1),
  );

  const fixture: Fixture = {
    createdAt: new Date().toISOString(),
    auction: {
      id: auction.auctionId,
      productId: auction.id,
      startPriceCents: AUCTION_START_PRICE_CENTS,
      bidStepCents: AUCTION_BID_STEP_CENTS,
      endsAt,
    },
    stockProduct: {
      id: stockProduct.id,
      priceCents: STOCK_PRODUCT_PRICE_CENTS,
      initialStock: STOCK,
    },
    buyers,
  };
  await writeFile(FIXTURE_FILE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`seed-load: auction ${auction.auctionId} ends at ${endsAt}; wrote ${FIXTURE_FILE}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
