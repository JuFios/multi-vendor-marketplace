/**
 * Long-form documentation of operations that the controllers only summarise: who may call them,
 * what they change and which errors mean what. Kept in one place so the API reads as a whole;
 * a unit test fails when an operation of the document has no entry here or on the controller.
 */
export interface OperationDoc {
  description: string;
  /** Example of the JSON request body. */
  requestExample?: unknown;
}

const ID = '3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b';
const OTHER_ID = '8a1c6e2f-7b3d-4c5e-8f90-a1b2c3d4e5f6';

const IDEMPOTENT =
  'Requires an `Idempotency-Key` header (a UUID). A retry with the same key and body returns the ' +
  'stored response with `Idempotent-Replayed: true`; the same key with a different body is 422.';

export const OPERATION_DOCS: Readonly<Record<string, OperationDoc>> = {
  'POST /api/auth/register': {
    description:
      'Registers a CUSTOMER with an email and a password (at least 8 characters, a letter and a ' +
      'digit). Returns an access token; the refresh token is set in the httpOnly `rt` cookie. ' +
      'Rate limited per address.',
    requestExample: { email: 'alice@example.com', password: 'S3cure-pass', name: 'Alice' },
  },
  'POST /api/auth/login': {
    description:
      'Signs in with email and password. An unknown email and a wrong password get the same ' +
      '401, so accounts cannot be enumerated. Rate limited per address and per email.',
    requestExample: { email: 'alice@example.com', password: 'S3cure-pass' },
  },
  'POST /api/auth/refresh': {
    description:
      'Rotates the refresh token: the old one stops working and a new cookie is set. Presenting ' +
      'a token that was already rotated revokes the whole session family. Needs the ' +
      '`X-Requested-With` header as a CSRF guard.',
  },
  'GET /api/auth/providers': {
    description: 'Tells the frontend whether Google sign-in is configured on this server.',
  },
  'GET /api/users/me': {
    description: 'Returns the profile, roles and, for a seller, the store of the caller.',
  },
  'PATCH /api/users/me': {
    description: 'Changes the display name. Markup in the name is stripped.',
    requestExample: { name: 'Alice Johnson' },
  },
  'POST /api/users/me/password': {
    description:
      'Sets or changes the password. With a password already set, `currentPassword` must match ' +
      'it (400 VALIDATION_FAILED otherwise). Without one (an account from Google, or one whose ' +
      'password was cleared when Google was linked to it) the new password is set directly, ' +
      'but only with a session opened after the Google link (403 FRESH_SIGN_IN_REQUIRED for an ' +
      'older one). Rate limited like login.',
    requestExample: { currentPassword: 'S3cure-pass', newPassword: 'N3w-secure-pass' },
  },
  'POST /api/sellers/applications': {
    description:
      'Creates the seller application of the caller, or re-submits a rejected one. An admin must ' +
      'approve it before the SELLER role is granted.',
    requestExample: {
      storeName: 'Alice’s Gadgets',
      description: 'Refurbished phones and tablets.',
    },
  },
  'GET /api/sellers/applications/me': {
    description: 'Status of the caller’s application, including the rejection reason if any.',
  },
  'GET /api/sellers/{id}': {
    description: 'Public store card. Stores that are not approved are 404.',
  },
  'GET /api/admin/seller-applications': {
    description: 'ADMIN only. Moderation queue of seller applications, oldest first.',
  },
  'POST /api/admin/seller-applications/{id}/approve': {
    description:
      'ADMIN only. Approves the application and grants the SELLER role; the applicant gets a ' +
      'notification and sees the new role after the next token refresh.',
  },
  'POST /api/admin/seller-applications/{id}/reject': {
    description: 'ADMIN only. Rejects the application; the applicant may re-apply.',
    requestExample: { reason: 'The store description is missing.' },
  },
  'GET /api/health': {
    description: 'Liveness: answers while the process runs. Touches no dependency.',
  },
  'GET /api/health/ready': {
    description:
      'Readiness: 200 when Postgres and Redis answer, 503 otherwise. The search index is ' +
      'reported but never fails readiness, because the catalog degrades without it.',
  },
  'GET /api/categories': {
    description: 'Public. The whole category tree as a flat list.',
  },
  'POST /api/admin/categories': {
    description: 'ADMIN only. Creates a category; the slug must be unique.',
    requestExample: { name: 'Home & Garden', slug: 'home-garden', parentId: ID },
  },
  'PATCH /api/admin/categories/{id}': {
    description:
      'ADMIN only. Renames, re-slugs or moves a category. A move that would create a cycle is ' +
      'refused. Products in the category are re-indexed.',
    requestExample: { name: 'Garden & Outdoor' },
  },
  'GET /api/seller/products': {
    description: 'SELLER only. Lists the store’s own products, including archived ones.',
  },
  'POST /api/seller/products': {
    description:
      'SELLER only. Creates a product of the caller’s store. A `FIXED_PRICE` product needs ' +
      '`priceCents` and `stock`; an `AUCTION` needs `startPriceCents`, `bidStepCents` and ' +
      '`endsAt` (1 minute to 30 days ahead). Money is in cents. With pre-moderation enabled the ' +
      'product stays hidden until an admin approves it.',
    requestExample: {
      type: 'FIXED_PRICE',
      categoryId: ID,
      title: 'Refurbished phone',
      description: 'Tested, 12 months warranty.',
      images: ['https://cdn.example.com/phone.jpg'],
      priceCents: 1299900,
      stock: 5,
    },
  },
  'GET /api/seller/products/{id}': {
    description: 'SELLER only. A product of another store is 404, not 403.',
  },
  'PATCH /api/seller/products/{id}': {
    description:
      'SELLER only. Edits own product; its type cannot change. Another store’s product is 404.',
    requestExample: { title: 'Refurbished phone, 128 GB', priceCents: 1249900 },
  },
  'DELETE /api/seller/products/{id}': {
    description:
      'SELLER only. Soft delete: the product is archived and leaves the catalog; carts that ' +
      'hold it mark the line unavailable. An auction with bids or a pending winner cannot be ' +
      'archived (409).',
  },
  'PATCH /api/seller/products/{id}/stock': {
    description:
      'SELLER only. Sets the stock to an absolute number; connected clients are notified. ' +
      'Send the stock the new number was decided on as `expectedStock`: if a sale or a ' +
      'cancellation changed it meanwhile, nothing is written and the answer is 409 ' +
      'PRODUCT_STOCK_CONFLICT with the current `stock`.',
    requestExample: { stock: 12, expectedStock: 10 },
  },
  'GET /api/products/{id}': {
    description:
      'Public product page, cached in Redis and invalidated on every change. Unpublished, ' +
      'archived and rejected products are 404.',
  },
  'GET /api/products/{id}/stock': {
    description:
      'Uncached stock and version, used by the client to resynchronise after a reconnect.',
  },
  'GET /api/products/{id}/similar': {
    description: 'Other available products of the same category, newest first.',
  },
  'GET /api/admin/products': {
    description: 'ADMIN only. Products waiting for moderation, or filtered by moderation status.',
  },
  'POST /api/admin/products/{id}/approve': {
    description: 'ADMIN only. Approves the product and publishes it to the catalog.',
  },
  'POST /api/admin/products/{id}/reject': {
    description: 'ADMIN only. Rejects the product and takes it out of the catalog.',
    requestExample: { reason: 'The photos do not show the item.' },
  },
  'GET /api/auctions/{id}': {
    description:
      'Uncached auction state: round, status, current price, `minNextBidCents`, deadline and ' +
      '`serverTime`, so a client can count down without trusting its own clock.',
  },
  'GET /api/auctions/{id}/bids': {
    description:
      'Bids of one round. Other bidders appear as `Bidder #xxxx`; the caller’s own bids show ' +
      '`You` and `isOwn: true`. The token is optional.',
  },
  'POST /api/auctions/{id}/bids': {
    description:
      'Places a bid of at least `minNextBidCents`. Concurrent bids are serialised by optimistic ' +
      'locking on the auction row and the deadline is checked against the database clock; a ' +
      'bid that keeps losing the race (after `BID_MAX_RETRIES` attempts) is 409 `BID_CONFLICT` ' +
      'and can be retried. ' +
      'Too low, after the deadline, or on the caller’s own lot is 422. Rate limited per user. ' +
      IDEMPOTENT,
    requestExample: { amountCents: 1350000 },
  },
  'GET /api/seller/auctions': {
    description: 'SELLER only. The store’s auctions with their current leader and bid count.',
  },
  'GET /api/catalog': {
    description:
      'Full-text search with facets (categories, stores, types, availability, price range) ' +
      'served by Meilisearch. Every filter is validated before it reaches the index. If the ' +
      'index is down the response falls back to Postgres: `degraded: true` and an ' +
      '`X-Search-Degraded` header, without typo tolerance and facets.',
  },
  'GET /api/cart': {
    description:
      'The active cart grouped by store, priced at current prices. Lines that can no longer be ' +
      'bought are flagged `UNAVAILABLE`.',
  },
  'DELETE /api/cart': {
    description: 'Removes every line of the active cart.',
  },
  'POST /api/cart/items': {
    description:
      'Adds a product to the cart (the quantity adds up). An auction lot can be added only by ' +
      'its winner within the checkout window. A seller cannot buy their own products (422).',
    requestExample: { productId: ID, quantity: 2 },
  },
  'PATCH /api/cart/items/{productId}': {
    description: 'Sets the quantity of a line already in the cart.',
    requestExample: { quantity: 3 },
  },
  'DELETE /api/cart/items/{productId}': {
    description: 'Removes one line from the cart.',
  },
  'GET /api/seller/finance': {
    description:
      'SELLER only. Gross sales, refunds, commission, net, payouts and the current balance of ' +
      'the store, all summed from the ledger.',
  },
  'GET /api/admin/ledger': {
    description: 'ADMIN only. Raw ledger entries, filterable by store and period.',
  },
  'POST /api/orders/checkout': {
    description:
      'Turns the cart into one order with one seller order per store, in a single database ' +
      'transaction: stock of every store is decremented with conditional updates, commission ' +
      'is computed per seller order and the ledger is written. Any unavailable line fails the ' +
      'whole checkout with 409 and nothing changes. With `expectedTotalCents` (the total the ' +
      'buyer saw) a cart whose prices moved meanwhile is refused with 409 ' +
      '`CHECKOUT_TOTAL_CHANGED` instead of being charged. Payment is a mock and runs ' +
      'asynchronously. ' +
      IDEMPOTENT,
    requestExample: { expectedTotalCents: 250_000 },
  },
  'GET /api/orders': {
    description: 'The caller’s own orders. Orders of other customers never appear.',
  },
  'GET /api/orders/{id}': {
    description:
      'An own order with its seller orders, items and status history. Anyone else’s order is 404.',
  },
  'POST /api/orders/{orderId}/seller-orders/{soId}/confirm-receipt': {
    description:
      'The customer confirms delivery; a SHIPPED seller order becomes COMPLETED and the payout runs.',
  },
  'POST /api/orders/{orderId}/seller-orders/{soId}/cancel': {
    description:
      'The customer cancels a seller order that is still NEW. Stock returns, commission is ' +
      'reversed, and the other seller orders of the same order are untouched.',
  },
  'GET /api/seller/orders': {
    description:
      'SELLER only. Seller orders of the caller’s store; other stores’ orders never appear.',
  },
  'GET /api/seller/orders/{id}': {
    description: 'SELLER only. Another store’s seller order is 404.',
  },
  'POST /api/seller/orders/{id}/status': {
    description:
      'SELLER only. NEW → PROCESSING (once payment is captured) and PROCESSING → SHIPPED. Any ' +
      'other transition is 409. The aggregate status of the parent order is recomputed.',
    requestExample: { status: 'PROCESSING' },
  },
  'POST /api/seller/orders/{id}/cancel': {
    description:
      'SELLER only. Cancels a NEW or PROCESSING seller order; stock returns and the commission ' +
      'is reversed. The rest of the order continues.',
    requestExample: { reason: 'The item turned out to be out of stock.' },
  },
  'POST /api/seller/orders/{id}/refunds': {
    description:
      'SELLER only. Partial refund of items of a paid seller order. The commission is ' +
      'recomputed on what remains. Units of a PROCESSING order go back in stock; shipped units ' +
      'do not. ' +
      IDEMPOTENT,
    requestExample: {
      items: [{ sellerOrderItemId: ID, quantity: 1 }],
      reason: 'The screen is scratched.',
    },
  },
  'GET /api/admin/orders': {
    description: 'ADMIN only. All orders, newest first.',
  },
  'GET /api/admin/orders/{id}': {
    description: 'ADMIN only. Any order with its seller orders.',
  },
  'POST /api/admin/seller-orders/{id}/status': {
    description: 'ADMIN only. Completes a shipped seller order on the customer’s behalf.',
    requestExample: { status: 'COMPLETED' },
  },
  'POST /api/admin/seller-orders/{id}/cancel': {
    description: 'ADMIN only. Cancels any seller order that is not final.',
    requestExample: { reason: 'Fraud suspected.' },
  },
  'GET /api/notifications': {
    description:
      'The caller’s notifications. `after` (ISO date) returns only newer ones, which is how a ' +
      'reconnecting client catches up.',
  },
  'GET /api/notifications/unread-count': {
    description: 'Number of unread notifications of the caller.',
  },
  'POST /api/notifications/read-all': {
    description: 'Marks every notification of the caller as read.',
  },
  'POST /api/notifications/{id}/read': {
    description: 'Marks one own notification as read. Someone else’s is 404.',
  },
  'GET /api/products/{id}/reviews': {
    description: 'Public reviews of a published product with the average rating.',
  },
  'POST /api/products/{id}/reviews': {
    description:
      'A review is accepted only from a customer who received the product (a COMPLETED seller ' +
      'order); one review per product. Otherwise 403 `REVIEW_NOT_ALLOWED`. The rating of the ' +
      'product and the search index update asynchronously.',
    requestExample: { rating: 5, text: 'Works as described, fast delivery.' },
  },
  'GET /api/products/{id}/reviews/eligibility': {
    description: 'Whether the caller may review the product now, and why not if they may not.',
  },
  'POST /api/disputes': {
    description:
      'Opens a dispute on a seller order of the caller’s own order (PROCESSING, SHIPPED or ' +
      'COMPLETED). One open dispute per seller order. Someone else’s order is 404.',
    requestExample: { sellerOrderId: ID, reason: 'The parcel never arrived.' },
  },
  'GET /api/disputes': {
    description: 'Disputes the caller takes part in: as the buyer or as the store.',
  },
  'GET /api/disputes/{id}': {
    description: 'A dispute with its messages. Not a party to it means 404.',
  },
  'POST /api/disputes/{id}/messages': {
    description: 'Buyer, store and admin may write while the dispute is not resolved.',
    requestExample: { text: 'I have sent the tracking number by message.' },
  },
  'GET /api/admin/disputes': {
    description: 'ADMIN only. All disputes, optionally by status.',
  },
  'POST /api/admin/disputes/{id}/review': {
    description: 'ADMIN only. OPEN → UNDER_REVIEW.',
  },
  'POST /api/admin/disputes/{id}/resolve': {
    description:
      'ADMIN only. Closes the dispute. In favour of the buyer it may refund items and set the ' +
      'final status of the seller order (CANCELLED or COMPLETED); in favour of the seller it ' +
      'only records the note. ' +
      IDEMPOTENT,
    requestExample: {
      outcome: 'RESOLVED_BUYER_FAVOR',
      refundItems: [{ sellerOrderItemId: OTHER_ID, quantity: 1 }],
      sellerOrderFinalStatus: 'COMPLETED',
      note: 'The carrier confirmed the loss.',
    },
  },
  'GET /api/admin/analytics/summary': {
    description:
      'ADMIN only. Platform revenue (commission), sales by store, top 5 products and stores and ' +
      'the cart-to-order conversion for a period. Served from read models, so it lags the ' +
      'orders by the event latency.',
  },
  'GET /api/admin/analytics/sales-chart': {
    description: 'ADMIN only. Daily sales of the last N days next to the N days before.',
  },
  'GET /api/admin/analytics/report': {
    description:
      'ADMIN only. The summary as a download: `csv` (long format, spreadsheet formulas are ' +
      'neutralised) or `json` (versioned, for import).',
  },
  'GET /api/seller/dashboard': {
    description:
      'SELLER only. Own revenue, seller orders by status, recent orders and live auctions.',
  },
};

export const PARAMETER_DOCS: Readonly<Record<string, string>> = {
  id: 'Identifier (UUID) of the resource.',
  productId: 'Identifier (UUID) of the product.',
  orderId: 'Identifier (UUID) of the order.',
  soId: 'Identifier (UUID) of the seller order inside that order.',
  page: 'Page number, starting at 1.',
  limit: 'Page size.',
  status: 'Only entries in this status.',
  type: 'Product type: `FIXED_PRICE` or `AUCTION`.',
  moderationStatus: 'Moderation status of the product.',
  categoryId: 'Only products of this category (UUID).',
  sellerId: 'Only this store (UUID).',
  q: 'Search text.',
  priceMin: 'Lowest price in cents.',
  priceMax: 'Highest price in cents.',
  ratingMin: 'Lowest average rating.',
  inStock: 'Only products that are (`true`) or are not (`false`) in stock.',
  sort: 'Sort order.',
  round: 'Auction round; the current round when omitted.',
  from: 'Start of the period (ISO 8601).',
  to: 'End of the period (ISO 8601).',
  after: 'Only entries created after this moment (ISO 8601).',
  days: 'Length of the period in days.',
  format: 'Download format: `csv` or `json`.',
  'X-Requested-With':
    'Any value, for example `XMLHttpRequest`; a CSRF guard for cookie-based calls.',
  'Idempotency-Key': 'UUID chosen by the client; repeating it replays the first result.',
};
