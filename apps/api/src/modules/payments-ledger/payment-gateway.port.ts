export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CaptureRequest {
  readonly sellerOrderId: string;
  readonly amountCents: number;
}

export type CaptureResult =
  | { readonly ok: true; readonly providerRef: string }
  | { readonly ok: false; readonly reason: string };

/** Takes the money for one seller order. A decline is a result; only a fault throws. */
export interface PaymentGatewayPort {
  capture(request: CaptureRequest): Promise<CaptureResult>;
}
