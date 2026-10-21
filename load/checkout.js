// 500 buyers check out one unit of a product that has 100 in stock, all at the same moment:
// exactly 100 checkouts must succeed. Run through the compose profile, see README.
import http from 'k6/http';
import { Counter } from 'k6/metrics';

import {
  API_URL,
  authHeaders,
  buyerOfThisVu,
  errorCode,
  fixture,
  textReport,
  uuid,
} from './lib/common.js';

const BUYERS = Number(__ENV.CHECKOUT_VUS || 500);
const EXPECTED_SUCCESSES = fixture.stockProduct.initialStock;

const checkoutSucceeded = new Counter('checkout_succeeded');
const checkoutOutOfStock = new Counter('checkout_out_of_stock');
const cartOutOfStock = new Counter('cart_out_of_stock');
const unexpectedResponses = new Counter('checkout_unexpected');

const thresholds = {
  // 409 (stock ran out) is the expected answer for every buyer after the 100th.
  http_req_failed: ['rate<0.01'],
  'http_req_duration{name:add_to_cart}': ['p(95)<10000'],
  'http_req_duration{name:checkout}': ['p(95)<10000'],
  'http_reqs{name:checkout}': ['count>0'],
  checkout_unexpected: ['count==0'],
};
// The invariant of the scenario holds only when demand exceeds supply.
if (BUYERS >= EXPECTED_SUCCESSES) {
  thresholds.checkout_succeeded = [`count==${EXPECTED_SUCCESSES}`];
}

export const options = {
  scenarios: {
    buyers: {
      // One iteration per VU, all VUs released together.
      executor: 'per-vu-iterations',
      vus: BUYERS,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds,
};

const addStatuses = http.expectedStatuses(201, 409);
const checkoutStatuses = http.expectedStatuses(201, 409);

export default function () {
  const buyer = buyerOfThisVu();

  const added = http.post(
    `${API_URL}/api/cart/items`,
    JSON.stringify({ productId: fixture.stockProduct.id, quantity: 1 }),
    {
      headers: authHeaders(buyer.token),
      tags: { name: 'add_to_cart' },
      responseCallback: addStatuses,
    },
  );
  if (added.status === 409 && errorCode(added) === 'INSUFFICIENT_STOCK') {
    cartOutOfStock.add(1);
    return;
  }
  if (added.status !== 201) {
    unexpectedResponses.add(1);
    console.error(`unexpected cart response ${added.status}: ${String(added.body).slice(0, 200)}`);
    return;
  }

  const checkout = http.post(`${API_URL}/api/orders/checkout`, null, {
    headers: authHeaders(buyer.token, { 'Idempotency-Key': uuid() }),
    tags: { name: 'checkout' },
    responseCallback: checkoutStatuses,
  });
  if (checkout.status === 201) {
    checkoutSucceeded.add(1);
  } else if (
    checkout.status === 409 &&
    ['INSUFFICIENT_STOCK', 'CART_ITEMS_UNAVAILABLE'].includes(errorCode(checkout))
  ) {
    checkoutOutOfStock.add(1);
  } else {
    unexpectedResponses.add(1);
    console.error(
      `unexpected checkout response ${checkout.status}: ${String(checkout.body).slice(0, 200)}`,
    );
  }
}

export function handleSummary(data) {
  const report = textReport(
    'checkout: many buyers, limited stock',
    data,
    [
      ['add to cart', 'http_req_duration{name:add_to_cart}'],
      ['checkout', 'http_req_duration{name:checkout}'],
    ],
    [
      ['checkouts succeeded (201)', 'checkout_succeeded'],
      ['checkouts out of stock (409)', 'checkout_out_of_stock'],
      ['rejected at the cart (409)', 'cart_out_of_stock'],
      ['unexpected responses', 'checkout_unexpected'],
    ],
  );
  return {
    stdout: report,
    '/load/results/checkout-summary.json': JSON.stringify(data, null, 2),
  };
}
