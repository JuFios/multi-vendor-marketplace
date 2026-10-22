export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CaptureRequest {
  readonly sellerOrderId: string;
  readonly amountCents: number;
}

export type CaptureResult =
  | { readonly ok: true; readonly providerRef: string }
  | { readonly ok: false; readonly reason: string };

export interface RefundRequest {
  readonly sellerOrderId: string;
  /** Names this refund; the same key must never move the money twice. */
  readonly refundKey: string;
  readonly amountCents: number;
}

export type RefundResult =
  | { readonly ok: true; readonly providerRef: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Takes the money for one seller order. A decline is a result; only a fault throws.
 *
 * `sellerOrderId` is the idempotency key. A capture is not part of the transaction that records
 * its outcome, so the same seller order can be presented again; the gateway must then answer with
 * the first outcome instead of taking the money twice.
 */
export interface PaymentGatewayPort {
  capture(request: CaptureRequest): Promise<CaptureResult>;

  /**
   * Gives money back to the buyer of a captured seller order. A refusal is a result; only a
   * fault throws. `refundKey` is the idempotency key: a refund can be presented again after a
   * crash, and the gateway must then answer with the first outcome instead of paying twice.
   */
  refund(request: RefundRequest): Promise<RefundResult>;
}
