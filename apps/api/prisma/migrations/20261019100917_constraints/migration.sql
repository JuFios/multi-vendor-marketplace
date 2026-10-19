-- Constraints and indexes that Prisma cannot express in the schema.

-- CHECK constraints
ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0),
  ADD CONSTRAINT "products_price_cents_positive" CHECK ("price_cents" IS NULL OR "price_cents" > 0);

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "seller_order_items"
  ADD CONSTRAINT "seller_order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "seller_order_items_refunded_quantity_range"
    CHECK ("refunded_quantity" BETWEEN 0 AND "quantity");

ALTER TABLE "seller_orders"
  ADD CONSTRAINT "seller_orders_refunded_cents_range"
    CHECK ("refunded_cents" BETWEEN 0 AND "subtotal_cents");

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "auctions"
  ADD CONSTRAINT "auctions_amounts_positive"
    CHECK ("bid_step_cents" > 0 AND "start_price_cents" > 0);

-- Partial unique indexes
CREATE UNIQUE INDEX "carts_one_active_per_user_key"
  ON "carts" ("user_id")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "disputes_one_open_per_seller_order_key"
  ON "disputes" ("seller_order_id")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

-- Partial index for the outbox relay
CREATE INDEX "outbox_events_unpublished_idx"
  ON "outbox_events" ("occurred_at")
  WHERE "published_at" IS NULL;

-- Trigram index for the degraded (database) search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "products_title_trgm_idx"
  ON "products" USING GIN ("title" gin_trgm_ops);

-- Emails are compared lower-cased everywhere; make that a rule of the tables, not just of the code.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_email_lowercase" CHECK ("email" = lower("email"));
