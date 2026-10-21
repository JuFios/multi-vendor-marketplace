import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { paymentsConfig } from '../../config/payments.config';

import type { CaptureRequest, CaptureResult, PaymentGatewayPort } from './payment-gateway.port';

/**
 * Approves every payment except the configured share, which it declines. The outcome is kept
 * per seller order: a charge repeats when the recording transaction rolls back, and a real
 * provider answers a repeated idempotency key with the first outcome instead of charging twice.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGatewayPort {
  private readonly outcomes = new Map<string, CaptureResult>();

  constructor(
    @Inject(paymentsConfig.KEY) private readonly settings: ConfigType<typeof paymentsConfig>,
  ) {}

  capture(request: CaptureRequest): Promise<CaptureResult> {
    const known = this.outcomes.get(request.sellerOrderId);
    if (known !== undefined) {
      return Promise.resolve(known);
    }
    const result: CaptureResult =
      Math.random() < this.settings.mockFailureRate
        ? { ok: false, reason: 'PAYMENT_DECLINED' }
        : { ok: true, providerRef: `mock_${randomUUID()}` };
    this.outcomes.set(request.sellerOrderId, result);
    return Promise.resolve(result);
  }
}
