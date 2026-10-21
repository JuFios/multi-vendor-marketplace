import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOAD_DIR = join(__dirname, '..');
// Holds access tokens: git-ignored, written by `seed-load.ts`, read by the k6 scripts and `verify.ts`.
export const FIXTURE_FILE = join(LOAD_DIR, '.tokens.json');
// Git-ignored; the k6 scripts write their summaries here.
export const RESULTS_DIR = join(LOAD_DIR, 'results');

export interface FixtureBuyer {
  email: string;
  token: string;
}

export interface Fixture {
  createdAt: string;
  auction: {
    id: string;
    productId: string;
    startPriceCents: number;
    bidStepCents: number;
    endsAt: string;
  };
  stockProduct: {
    id: string;
    priceCents: number;
    initialStock: number;
  };
  buyers: FixtureBuyer[];
}

export function readFixture(): Fixture {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as Fixture;
  } catch (error) {
    throw new Error(`Cannot read ${FIXTURE_FILE}; run the seed step first`, { cause: error });
  }
}
