import { Inject, Injectable, Logger } from '@nestjs/common';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';

import { PaymentAttemptsRepository } from './payment-attempts.repository';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from './payment-gateway.port';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    private readonly attempts: PaymentAttemptsRepository,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Charges one seller order and records the outcome as an attempt and an event. A decline is
   * a normal outcome (the saga compensates); only an exception makes the queue retry.
   */
  async charge(sellerOrderId: string, amountCents: number): Promise<void> {
    const result = await this.gateway.capture({ sellerOrderId, amountCents });
    const paymentAttemptId = await this.attempts.create({
      sellerOrderId,
      amountCents,
      status: result.ok ? 'CAPTURED' : 'FAILED',
      providerRef: result.ok ? result.providerRef : null,
      failureReason: result.ok ? null : result.reason,
    });
    await this.outbox.add([
      result.ok
        ? {
            type: EVENT_TYPE.PAYMENT_CAPTURED,
            aggregateType: 'SellerOrder',
            aggregateId: sellerOrderId,
            payload: { sellerOrderId, paymentAttemptId },
            actorId: null,
          }
        : {
            type: EVENT_TYPE.PAYMENT_FAILED,
            aggregateType: 'SellerOrder',
            aggregateId: sellerOrderId,
            payload: { sellerOrderId, reason: result.reason },
            actorId: null,
          },
    ]);
    this.logger.log({
      msg: result.ok ? 'payment.captured' : 'payment.failed',
      sellerOrderId,
      amountCents,
    });
  }
}
