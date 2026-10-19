import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { paymentsConfig } from '../../config';

import type { CaptureResult, PaymentGatewayPort } from './payment-gateway.port';

/** Approves every payment except the configured share, which it declines. */
@Injectable()
export class MockPaymentGateway implements PaymentGatewayPort {
  constructor(
    @Inject(paymentsConfig.KEY) private readonly settings: ConfigType<typeof paymentsConfig>,
  ) {}

  capture(): Promise<CaptureResult> {
    return Promise.resolve(
      Math.random() < this.settings.mockFailureRate
        ? { ok: false, reason: 'PAYMENT_DECLINED' }
        : { ok: true, providerRef: `mock_${randomUUID()}` },
    );
  }
}
