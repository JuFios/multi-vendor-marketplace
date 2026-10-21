/**
 * Checks the invariants that must hold after the load scenarios, straight from the database, and
 * records the metrics the api exposes. Exits with 1 when one of them is violated.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../apps/api/src/generated/prisma/client';
import { DATABASE_SESSION_OPTIONS } from '../apps/api/src/prisma/session-options';

import { type Fixture, readFixture, RESULTS_DIR } from './lib/fixture';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://marketplace:marketplace@localhost:5432/marketplace';
// Asynchronous work (outbox relay, payment saga) may still run when the load stops.
const DRAIN_TIMEOUT_MS = 120_000;

const REPORTED_METRICS = [
  'bid_optimistic_retries_total',
  'bids_placed_total',
  'bids_rejected_total',
  'orders_created_total',
  'checkout_failures_total',
  'app_errors_total',
  'queue_jobs_failed_total',
  'queue_dead_letter_total',
  'outbox_pending_events',
] as const;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

/** Same rule as the platform: whole cents, round half up. */
function commissionOf(amountCents: number, rateBps: number): number {
  return Math.floor((amountCents * rateBps + 5000) / 10_000);
}

function readK6Counter(file: string, metric: string): number | undefined {
  const path = join(RESULTS_DIR, file);
  if (!existsSync(path)) {
    return undefined;
  }
  const data = JSON.parse(readFileSync(path, 'utf8')) as {
    metrics: Record<string, { values?: { count?: number } }>;
  };
  return data.metrics[metric]?.values?.count;
}

async function waitForDrain(prisma: PrismaClient, productId: string): Promise<number> {
  const startedAt = Date.now();
  for (;;) {
    const [unpublished, unpaid] = await Promise.all([
      prisma.outboxEvent.count({ where: { publishedAt: null } }),
      prisma.sellerOrder.count({
        where: { paymentStatus: 'PENDING', items: { some: { productId } } },
      }),
    ]);
    if (unpublished === 0 && unpaid === 0) {
      return Date.now() - startedAt;
    }
    if (Date.now() - startedAt > DRAIN_TIMEOUT_MS) {
      check(
        'asynchronous work drained',
        false,
        `${unpublished} outbox events unpublished, ${unpaid} payments pending after ${DRAIN_TIMEOUT_MS} ms`,
      );
      return Date.now() - startedAt;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function verifyAuction(prisma: PrismaClient, auction: Fixture['auction']): Promise<void> {
  const stored = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
  const bids = await prisma.bid.findMany({
    where: { auctionId: auction.id, round: stored.round },
    orderBy: { amountCents: 'asc' },
  });
  if (bids.length === 0) {
    check('auction: bids placed', false, 'no bid was accepted, was the bids scenario run?');
    return;
  }

  check(
    'auction: bid count matches stored bids',
    stored.bidCount === bids.length,
    `${stored.bidCount} counted, ${bids.length} stored`,
  );
  if (stored.status === 'ACTIVE' && stored.round === 1) {
    check(
      'auction: version advanced once per bid',
      stored.version === bids.length,
      `version ${stored.version}, ${bids.length} bids`,
    );
  }

  const amounts = bids.map((bid) => bid.amountCents);
  check(
    'auction: accepted amounts are distinct',
    new Set(amounts).size === amounts.length,
    `${amounts.length} bids`,
  );
  check(
    'auction: first bid reaches the start price',
    (amounts[0] ?? 0) >= auction.startPriceCents,
    `lowest ${amounts[0]}`,
  );
  const gaps = amounts.slice(1).map((amount, index) => amount - (amounts[index] ?? 0));
  check(
    'auction: every bid raised by at least the step',
    gaps.every((gap) => gap >= auction.bidStepCents),
    `smallest raise ${Math.min(...gaps, auction.bidStepCents)} cents, step ${auction.bidStepCents}`,
  );
  const inTimeOrder = [...bids].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  check(
    'auction: later bids are never lower (no lost update)',
    inTimeOrder.every((bid, index) => bid.id === bids[index]?.id),
    'bids ordered by time equal bids ordered by amount',
  );

  const top = bids[bids.length - 1];
  check(
    'auction: stored leader is the highest bid',
    stored.currentPriceCents === top?.amountCents &&
      stored.highestBidId === top.id &&
      stored.highestBidderId === top.bidderId,
    `price ${stored.currentPriceCents}, highest bid ${top?.amountCents}`,
  );

  const events = await prisma.outboxEvent.count({
    where: { eventType: 'auction.bid_placed', aggregateId: auction.id },
  });
  const totalBids = await prisma.bid.count({ where: { auctionId: auction.id } });
  check(
    'auction: one event per accepted bid',
    events === totalBids,
    `${events} events, ${totalBids} bids`,
  );

  const accepted = readK6Counter('bids-summary.json', 'bids_accepted');
  if (accepted !== undefined) {
    check(
      'auction: accepted bids seen by k6 equal stored bids',
      accepted === totalBids,
      `k6 saw ${accepted}, database holds ${totalBids}`,
    );
  }
}

async function verifyCheckout(
  prisma: PrismaClient,
  product: Fixture['stockProduct'],
): Promise<void> {
  const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  const items = await prisma.sellerOrderItem.findMany({
    where: { productId: product.id, sellerOrder: { status: { not: 'CANCELLED' } } },
    include: { sellerOrder: true },
  });
  if (items.length === 0) {
    check('checkout: orders created', false, 'no seller order, was the checkout scenario run?');
    return;
  }

  const sellerOrders = items.map((item) => item.sellerOrder);
  const unitsSold = items.reduce((sum, item) => sum + item.quantity, 0);
  check('checkout: stock never below zero', stored.stock >= 0, `stock ${stored.stock}`);
  check(
    'checkout: stock sold equals stock removed',
    unitsSold === product.initialStock - stored.stock,
    `${unitsSold} units in orders, ${product.initialStock} - ${stored.stock} removed`,
  );
  check(
    'checkout: seller orders equal the initial stock',
    sellerOrders.length === product.initialStock && stored.stock === 0,
    `${sellerOrders.length} seller orders, ${stored.stock} left of ${product.initialStock}`,
  );

  const orders = await prisma.order.findMany({
    where: { id: { in: sellerOrders.map((so) => so.orderId) } },
  });
  check(
    'checkout: one order per buyer',
    new Set(orders.map((order) => order.customerId)).size === orders.length &&
      orders.length === sellerOrders.length,
    `${orders.length} orders, ${new Set(orders.map((order) => order.customerId)).size} buyers`,
  );
  check(
    'checkout: order totals add up',
    orders.every((order) => {
      const parts = sellerOrders.filter((so) => so.orderId === order.id);
      return (
        order.subtotalCents === parts.reduce((sum, so) => sum + so.subtotalCents, 0) &&
        order.commissionCents === parts.reduce((sum, so) => sum + so.commissionCents, 0)
      );
    }),
    `${orders.length} orders`,
  );

  check(
    'checkout: commission and payout are consistent',
    sellerOrders.every(
      (so) =>
        so.commissionCents ===
          commissionOf(so.subtotalCents - so.refundedCents, so.commissionRateBps) &&
        so.payoutCents === so.subtotalCents - so.refundedCents - so.commissionCents,
    ),
    `${sellerOrders.length} seller orders`,
  );

  const ledger = await prisma.ledgerEntry.groupBy({
    by: ['sellerOrderId'],
    where: { sellerOrderId: { in: sellerOrders.map((so) => so.id) } },
    _sum: { amountCents: true },
  });
  const ledgerSums = new Map(ledger.map((row) => [row.sellerOrderId, row._sum.amountCents ?? 0]));
  // Nothing is paid out or cancelled in the scenario, so each seller order's ledger nets to its payout.
  check(
    'checkout: ledger sum per seller order equals its payout',
    sellerOrders.every((so) => ledgerSums.get(so.id) === so.payoutCents),
    `${ledger.length} seller orders with entries`,
  );

  const declined = sellerOrders.filter((so) => so.paymentStatus !== 'CAPTURED').length;
  check('checkout: every payment captured', declined === 0, `${declined} not captured`);

  const succeeded = readK6Counter('checkout-summary.json', 'checkout_succeeded');
  if (succeeded !== undefined) {
    check(
      'checkout: successes seen by k6 equal seller orders',
      succeeded === sellerOrders.length,
      `k6 saw ${succeeded}, database holds ${sellerOrders.length}`,
    );
  }
}

async function readMetrics(): Promise<Record<string, number>> {
  const response = await fetch(`${API_URL}/metrics`);
  const text = await response.text();
  const values: Record<string, number> = {};
  for (const line of text.split('\n')) {
    const match = /^([a-z_]+)(\{[^}]*\})?\s+(\S+)$/.exec(line);
    const name = match?.[1];
    if (match && name && (REPORTED_METRICS as readonly string[]).includes(name)) {
      const key = `${name}${match[2] ?? ''}`;
      values[key] = (values[key] ?? 0) + Number(match[3]);
    }
  }
  return values;
}

async function main(): Promise<void> {
  const fixture = readFixture();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL, options: DATABASE_SESSION_OPTIONS }),
  });
  try {
    const drainMs = await waitForDrain(prisma, fixture.stockProduct.id);
    check(
      'no product has negative stock',
      (await prisma.product.count({ where: { stock: { lt: 0 } } })) === 0,
      'all products',
    );
    await verifyAuction(prisma, fixture.auction);
    await verifyCheckout(prisma, fixture.stockProduct);

    const metrics = await readMetrics();
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(
      join(RESULTS_DIR, 'verify.json'),
      `${JSON.stringify({ drainMs, checks, metrics }, null, 2)}\n`,
    );

    for (const entry of checks) {
      console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name} (${entry.detail})`);
    }
    console.log(`\nasynchronous work drained in ${drainMs} ms\n\napi metrics:`);
    for (const [name, value] of Object.entries(metrics)) {
      console.log(`  ${name} ${value}`);
    }
    const failed = checks.filter((entry) => !entry.ok).length;
    console.log(`\n${failed === 0 ? 'all invariants hold' : `${failed} invariant(s) violated`}`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
