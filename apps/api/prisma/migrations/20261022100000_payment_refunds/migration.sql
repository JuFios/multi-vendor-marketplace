-- The gateway's answer to each refund request: one row per `payment.refund_requested` event.

-- CreateEnum
CREATE TYPE "payment_refund_status" AS ENUM ('REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "refund_key" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "payment_refund_status" NOT NULL,
    "provider_ref" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_refund_key_key" ON "payment_refunds"("refund_key");

-- CreateIndex
CREATE INDEX "payment_refunds_seller_order_id_idx" ON "payment_refunds"("seller_order_id");

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
