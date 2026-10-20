import { createHash } from 'node:crypto';

import { calculateCommission } from '../../src/modules/orders/commission';
import {
  aggregateOrderStatus,
  type OrderStatusValue,
  type SellerOrderStatusValue,
} from '../../src/modules/orders/order-status';

import { seedId } from './seed-ids';

export const HISTORY_DAYS = 60;
export const HISTORY_BUYERS = 40;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface HistoryProduct {
  readonly id: string;
  readonly sellerId: string;
  readonly title: string;
  readonly priceCents: number;
}

export interface HistoryBuyer {
  readonly id: string;
  readonly key: string;
  /** Buyers that only ever leave a cart behind; they never order. */
  readonly abandonsCart: boolean;
}

export interface HistoryInput {
  readonly now: Date;
  readonly days: number;
  readonly products: readonly HistoryProduct[];
  /** Owner user of each store, who performs the store's side of an order. */
  readonly sellerUserIds: ReadonlyMap<string, string>;
  readonly buyers: readonly HistoryBuyer[];
  readonly commissionRateBps: number;
}

type ActorKind = 'CUSTOMER' | 'SELLER' | 'SYSTEM';
type LedgerKind =
  'SALE' | 'COMMISSION' | 'REFUND' | 'COMMISSION_REVERSAL' | 'CANCELLATION' | 'PAYOUT';

export interface HistoryOrderRow {
  readonly id: string;
  readonly customerId: string;
  readonly status: OrderStatusValue;
  readonly hasCancelledParts: boolean;
  readonly subtotalCents: number;
  readonly refundedCents: number;
  readonly totalCents: number;
  readonly commissionCents: number;
  readonly createdAt: Date;
}

export interface HistorySellerOrder {
  readonly row: {
    readonly id: string;
    readonly orderId: string;
    readonly sellerId: string;
    readonly status: SellerOrderStatusValue;
    readonly paymentStatus: 'CAPTURED' | 'REFUNDED';
    readonly subtotalCents: number;
    readonly refundedCents: number;
    readonly commissionRateBps: number;
    readonly commissionCents: number;
    readonly payoutCents: number;
    readonly cancelReason: string | null;
    readonly cancelledBy: ActorKind | null;
    readonly version: number;
    readonly createdAt: Date;
  };
  readonly items: readonly {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly productId: string;
    readonly titleSnapshot: string;
    readonly unitPriceCents: number;
    readonly quantity: number;
    readonly refundedQuantity: number;
    readonly refundedCents: number;
  }[];
  readonly statusHistory: readonly {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly fromStatus: SellerOrderStatusValue | null;
    readonly toStatus: SellerOrderStatusValue;
    readonly actorType: ActorKind;
    readonly actorId: string | null;
    readonly reason: string | null;
    readonly createdAt: Date;
  }[];
  readonly refunds: readonly {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly sellerOrderItemId: string;
    readonly quantity: number;
    readonly amountCents: number;
    readonly reason: string;
    readonly actorType: 'SELLER';
    readonly actorId: string;
    readonly createdAt: Date;
  }[];
  readonly ledger: readonly {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly sellerId: string;
    readonly type: LedgerKind;
    readonly amountCents: number;
    readonly refId: string | null;
    readonly createdAt: Date;
  }[];
  readonly payment: {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly amountCents: number;
    readonly status: 'CAPTURED';
    readonly providerRef: string;
    readonly createdAt: Date;
  };
  readonly payout: {
    readonly id: string;
    readonly sellerOrderId: string;
    readonly sellerId: string;
    readonly amountCents: number;
    readonly status: 'PAID';
    readonly paidAt: Date;
    readonly createdAt: Date;
  } | null;
}

export interface HistoryCart {
  readonly cart: {
    readonly id: string;
    readonly userId: string;
    readonly status: 'ACTIVE' | 'CONVERTED';
    readonly firstItemAddedAt: Date;
    readonly convertedAt: Date | null;
    readonly convertedOrderId: string | null;
    readonly createdAt: Date;
  };
  readonly items: readonly {
    readonly id: string;
    readonly cartId: string;
    readonly productId: string;
    readonly quantity: number;
    readonly addedAt: Date;
  }[];
}

export interface HistoryOrder {
  readonly order: HistoryOrderRow;
  readonly sellerOrders: readonly HistorySellerOrder[];
  readonly cart: HistoryCart;
}

export interface HistoryPlan {
  readonly orders: readonly HistoryOrder[];
  readonly abandonedCarts: readonly HistoryCart[];
}

/** Deterministic random numbers in [0, 1) for a key, so the same day always plans the same orders. */
function randomFor(key: string): () => number {
  let state = createHash('sha1').update(`marketplace-history:${key}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pickOne = <T>(items: readonly T[], random: () => number): T => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error('Nothing to pick from');
  }
  return item;
};

const dayKey = (time: number): string => new Date(time).toISOString().slice(0, 10);

interface Line {
  readonly product: HistoryProduct;
  readonly quantity: number;
}

function pickLines(products: readonly HistoryProduct[], random: () => number): Line[] {
  const count = 1 + Math.floor(random() * 3);
  const chosen = new Map<string, Line>();
  for (let attempt = 0; attempt < count * 3 && chosen.size < count; attempt += 1) {
    const product = pickOne(products, random);
    chosen.set(product.id, { product, quantity: 1 + Math.floor(random() * 3) });
  }
  return [...chosen.values()];
}

interface SellerOrderContext {
  readonly key: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly sellerId: string;
  readonly sellerUserId: string;
  readonly lines: readonly Line[];
  readonly placedAt: number;
  readonly now: number;
  readonly commissionRateBps: number;
}

/** One store's part of an order and everything the application would have written for it by now. */
function planSellerOrder(ctx: SellerOrderContext): HistorySellerOrder {
  const random = randomFor(`${ctx.key}:so`);
  const id = seedId(`history:so:${ctx.key}`);
  const at = (offsetMs: number): Date => new Date(ctx.placedAt + offsetMs);
  const elapsed = ctx.now - ctx.placedAt;

  const items = ctx.lines.map((line, index) => ({
    id: seedId(`history:item:${ctx.key}:${index}`),
    sellerOrderId: id,
    productId: line.product.id,
    titleSnapshot: line.product.title,
    unitPriceCents: line.product.priceCents,
    quantity: line.quantity,
  }));
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const commissionAtSale = calculateCommission(subtotalCents, ctx.commissionRateBps);

  const cancelDraw = random();
  const slowDraw = random();
  const refundDraw = random();
  const cancelledByCustomer = random() < 0.5;
  const cancelled = cancelDraw < 0.08 && elapsed >= 4 * HOUR_MS;

  let status: SellerOrderStatusValue = 'NEW';
  if (cancelled) {
    status = 'CANCELLED';
  } else if (elapsed >= 3 * DAY_MS) {
    status = 'COMPLETED';
  } else if (elapsed >= DAY_MS) {
    status = slowDraw < 0.3 ? 'PROCESSING' : 'SHIPPED';
  } else if (elapsed >= HOUR_MS) {
    status = 'PROCESSING';
  }

  // A store refunds one unit of the first item of an order it has shipped.
  const refunded =
    !cancelled &&
    (status === 'SHIPPED' || status === 'COMPLETED') &&
    refundDraw < 0.12 &&
    elapsed >= 36 * HOUR_MS;
  const first = items[0];
  const refundId = seedId(`history:refund:${ctx.key}`);
  const refundCents = refunded && first !== undefined ? first.unitPriceCents : 0;
  const commissionNow = cancelled
    ? 0
    : calculateCommission(subtotalCents - refundCents, ctx.commissionRateBps);
  const payoutCents = cancelled ? 0 : subtotalCents - refundCents - commissionNow;

  const transition = (
    step: string,
    from: SellerOrderStatusValue | null,
    to: SellerOrderStatusValue,
    actor: { type: ActorKind; id: string | null },
    offsetMs: number,
    reason: string | null = null,
  ) => ({
    id: seedId(`history:status:${ctx.key}:${step}`),
    sellerOrderId: id,
    fromStatus: from,
    toStatus: to,
    actorType: actor.type,
    actorId: actor.id,
    reason,
    createdAt: at(offsetMs),
  });
  const customer = { type: 'CUSTOMER', id: ctx.customerId } as const;
  const store = { type: 'SELLER', id: ctx.sellerUserId } as const;
  const statusHistory = [transition('new', null, 'NEW', customer, 0)];
  if (status === 'CANCELLED') {
    statusHistory.push(transition('processing', 'NEW', 'PROCESSING', store, HOUR_MS));
    statusHistory.push(
      transition(
        'cancelled',
        'PROCESSING',
        'CANCELLED',
        cancelledByCustomer ? customer : store,
        4 * HOUR_MS,
        cancelledByCustomer ? 'Changed my mind' : 'Out of stock',
      ),
    );
  } else {
    const path: [SellerOrderStatusValue, number][] = [
      ['PROCESSING', HOUR_MS],
      ['SHIPPED', DAY_MS],
      ['COMPLETED', 3 * DAY_MS],
    ];
    let previous: SellerOrderStatusValue = 'NEW';
    for (const [next, offset] of path) {
      if (previous === status) {
        break;
      }
      statusHistory.push(
        transition(
          next.toLowerCase(),
          previous,
          next,
          next === 'COMPLETED' ? customer : store,
          offset,
        ),
      );
      previous = next;
    }
  }

  const refundAt = 36 * HOUR_MS;
  const refunds =
    refunded && first !== undefined
      ? [
          {
            id: refundId,
            sellerOrderId: id,
            sellerOrderItemId: first.id,
            quantity: 1,
            amountCents: refundCents,
            reason: 'Item arrived damaged',
            actorType: 'SELLER' as const,
            actorId: ctx.sellerUserId,
            createdAt: at(refundAt),
          },
        ]
      : [];

  const entry = (
    type: LedgerKind,
    amountCents: number,
    offsetMs: number,
    refId: string | null = null,
  ) => ({
    id: seedId(`history:ledger:${ctx.key}:${type}:${offsetMs}`),
    sellerOrderId: id,
    sellerId: ctx.sellerId,
    type,
    amountCents,
    refId,
    createdAt: at(offsetMs),
  });
  const ledger = [entry('SALE', subtotalCents, 0), entry('COMMISSION', -commissionAtSale, 0)];
  if (refunds.length > 0) {
    ledger.push(entry('REFUND', -refundCents, refundAt, refundId));
    const givenBack = commissionAtSale - commissionNow;
    if (givenBack > 0) {
      ledger.push(entry('COMMISSION_REVERSAL', givenBack, refundAt, refundId));
    }
  }
  const payoutId = seedId(`history:payout:${ctx.key}`);
  if (status === 'CANCELLED') {
    ledger.push(entry('CANCELLATION', -subtotalCents, 4 * HOUR_MS));
    if (commissionAtSale > 0) {
      ledger.push(entry('COMMISSION_REVERSAL', commissionAtSale, 4 * HOUR_MS));
    }
  } else if (status === 'COMPLETED') {
    ledger.push(entry('PAYOUT', -payoutCents, 3 * DAY_MS, payoutId));
  }

  return {
    row: {
      id,
      orderId: ctx.orderId,
      sellerId: ctx.sellerId,
      status,
      paymentStatus: status === 'CANCELLED' ? 'REFUNDED' : 'CAPTURED',
      subtotalCents,
      refundedCents: refundCents,
      commissionRateBps: ctx.commissionRateBps,
      commissionCents: commissionNow,
      payoutCents,
      cancelReason:
        status === 'CANCELLED' ? (cancelledByCustomer ? 'Changed my mind' : 'Out of stock') : null,
      cancelledBy: status === 'CANCELLED' ? (cancelledByCustomer ? 'CUSTOMER' : 'SELLER') : null,
      version: statusHistory.length - 1 + refunds.length,
      createdAt: at(0),
    },
    items: items.map((item, index) => ({
      ...item,
      refundedQuantity: index === 0 && refunds.length > 0 ? 1 : 0,
      refundedCents: index === 0 ? refundCents : 0,
    })),
    statusHistory,
    refunds,
    ledger,
    payment: {
      id: seedId(`history:payment:${ctx.key}`),
      sellerOrderId: id,
      amountCents: subtotalCents,
      status: 'CAPTURED',
      providerRef: `mock_${id.slice(0, 8)}`,
      createdAt: at(60_000),
    },
    payout:
      status === 'COMPLETED'
        ? {
            id: payoutId,
            sellerOrderId: id,
            sellerId: ctx.sellerId,
            amountCents: payoutCents,
            status: 'PAID',
            paidAt: at(3 * DAY_MS),
            createdAt: at(3 * DAY_MS),
          }
        : null,
  };
}

function planOrder(
  key: string,
  placedAt: number,
  input: HistoryInput,
  random: () => number,
): HistoryOrder {
  const buyers = input.buyers.filter((buyer) => !buyer.abandonsCart);
  const buyer = pickOne(buyers, random);
  const lines = pickLines(input.products, random);
  const orderId = seedId(`history:order:${key}`);

  const bySeller = new Map<string, Line[]>();
  for (const line of lines) {
    bySeller.set(line.product.sellerId, [...(bySeller.get(line.product.sellerId) ?? []), line]);
  }
  const sellerOrders = [...bySeller.entries()].map(([sellerId, sellerLines]) =>
    planSellerOrder({
      key: `${key}:${sellerId}`,
      orderId,
      customerId: buyer.id,
      sellerId,
      sellerUserId: input.sellerUserIds.get(sellerId) ?? sellerId,
      lines: sellerLines,
      placedAt,
      now: input.now.getTime(),
      commissionRateBps: input.commissionRateBps,
    }),
  );

  const statuses = sellerOrders.map((so) => so.row.status);
  const aggregate = aggregateOrderStatus(statuses);
  const subtotalCents = sellerOrders.reduce((sum, so) => sum + so.row.subtotalCents, 0);
  // Like the application: refunds and the unrefunded part of a cancelled seller order both leave the total.
  const refundedCents = sellerOrders.reduce(
    (sum, so) =>
      sum + (so.row.status === 'CANCELLED' ? so.row.subtotalCents : so.row.refundedCents),
    0,
  );

  const firstItemAddedAt = new Date(placedAt - (5 + Math.floor(random() * 115)) * 60_000);
  const cartId = seedId(`history:cart:${key}`);
  return {
    order: {
      id: orderId,
      customerId: buyer.id,
      status: aggregate.status,
      hasCancelledParts: aggregate.hasCancelledParts,
      subtotalCents,
      refundedCents,
      totalCents: subtotalCents - refundedCents,
      commissionCents: sellerOrders.reduce((sum, so) => sum + so.row.commissionCents, 0),
      createdAt: new Date(placedAt),
    },
    sellerOrders,
    cart: {
      cart: {
        id: cartId,
        userId: buyer.id,
        status: 'CONVERTED',
        firstItemAddedAt,
        convertedAt: new Date(placedAt),
        convertedOrderId: orderId,
        createdAt: firstItemAddedAt,
      },
      items: lines.map((line, index) => ({
        id: seedId(`history:cart-item:${key}:${index}`),
        cartId,
        productId: line.product.id,
        quantity: line.quantity,
        addedAt: firstItemAddedAt,
      })),
    },
  };
}

function planAbandonedCart(buyer: HistoryBuyer, input: HistoryInput): HistoryCart | null {
  const random = randomFor(`abandoned:${buyer.key}`);
  if (random() >= 0.75) {
    return null;
  }
  const firstItemAddedAt = new Date(
    input.now.getTime() - Math.floor(random() * input.days * DAY_MS),
  );
  const cartId = seedId(`history:abandoned-cart:${buyer.key}`);
  return {
    cart: {
      id: cartId,
      userId: buyer.id,
      status: 'ACTIVE',
      firstItemAddedAt,
      convertedAt: null,
      convertedOrderId: null,
      createdAt: firstItemAddedAt,
    },
    items: pickLines(input.products, random).map((line, index) => ({
      id: seedId(`history:abandoned-item:${buyer.key}:${index}`),
      cartId,
      productId: line.product.id,
      quantity: line.quantity,
      addedAt: firstItemAddedAt,
    })),
  };
}

/**
 * Orders for the last `days` days with everything the application would have booked for them,
 * plus carts that were never checked out. A day always plans the same orders, so running the
 * seed again only adds what has become due since.
 */
export function planHistory(input: HistoryInput): HistoryPlan {
  const now = input.now.getTime();
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
  const orders: HistoryOrder[] = [];
  for (let back = input.days - 1; back >= 0; back -= 1) {
    const dayStart = today - back * DAY_MS;
    const day = dayKey(dayStart);
    const random = randomFor(`day:${day}`);
    const draw = random();
    const count = draw < 0.25 ? 1 : draw < 0.7 ? 2 : 3;
    for (let index = 0; index < count; index += 1) {
      const placedAt = dayStart + Math.floor(random() * DAY_MS);
      const orderRandom = randomFor(`order:${day}:${index}`);
      if (placedAt < now) {
        orders.push(planOrder(`${day}:${index}`, placedAt, input, orderRandom));
      }
    }
  }
  const abandonedCarts = input.buyers
    .filter((buyer) => buyer.abandonsCart)
    .map((buyer) => planAbandonedCart(buyer, input))
    .filter((cart): cart is HistoryCart => cart !== null);
  return { orders, abandonedCarts };
}
