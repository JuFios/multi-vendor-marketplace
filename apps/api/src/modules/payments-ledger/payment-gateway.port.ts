export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CaptureRequest {
  readonly sellerOrderId: string;
  readonly amountCents: number;
}

export type CaptureResult =
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
}
