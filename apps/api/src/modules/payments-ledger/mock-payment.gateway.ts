import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { paymentsConfig } from '../../config/payments.config';

import type {
  CaptureRequest,
  CaptureResult,
  PaymentGatewayPort,
  RefundRequest,
  RefundResult,
} from './payment-gateway.port';

/** 2^48: the hash prefix below spans [0, 2^48). */
const HASH_SPACE = 2 ** 48;

/**
 * Approves every payment except the configured share, which it declines, and every refund. The
 * outcome is derived from the seller order id (the refund key for a refund) alone, so a charge
 * repeated after a rolled-back recording gets the first outcome on any worker and after a
 * restart, like a real provider answering a repeated idempotency key, and nothing has to be
 * remembered.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGatewayPort {
  constructor(
    @Inject(paymentsConfig.KEY) private readonly settings: ConfigType<typeof paymentsConfig>,
  ) {}

  capture(request: CaptureRequest): Promise<CaptureResult> {
    const digest = createHash('sha256').update(request.sellerOrderId).digest('hex');
    // A uniform draw in [0, 1) that is the same for every presentation of this seller order.
    const draw = Number.parseInt(digest.slice(0, 12), 16) / HASH_SPACE;
    const result: CaptureResult =
      draw < this.settings.mockFailureRate
        ? { ok: false, reason: 'PAYMENT_DECLINED' }
        : { ok: true, providerRef: `mock_${digest.slice(0, 32)}` };
    return Promise.resolve(result);
  }

  refund(request: RefundRequest): Promise<RefundResult> {
    const digest = createHash('sha256').update(`refund:${request.refundKey}`).digest('hex');
    return Promise.resolve({ ok: true, providerRef: `mock_refund_${digest.slice(0, 32)}` });
  }
}
