import { Inject, Injectable, Logger } from '@nestjs/common';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';

import { PaymentAttemptsRepository } from './payment-attempts.repository';
import {
  type CaptureResult,
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from './payment-gateway.port';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    private readonly attempts: PaymentAttemptsRepository,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Takes the money for one seller order. Stays outside any database transaction: the call
   * must not hold a connection, and the gateway answers a repeated seller order with the first
   * outcome, so a charge that repeats after a rollback cannot take the money twice.
   */
  capture(sellerOrderId: string, amountCents: number): Promise<CaptureResult> {
    return this.gateway.capture({ sellerOrderId, amountCents });
  }

  /**
   * Records the outcome as an attempt and an event, in the caller's transaction. A decline is
   * a normal outcome (the saga compensates); only an exception makes the queue retry.
   */
  async record(sellerOrderId: string, amountCents: number, result: CaptureResult): Promise<void> {
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
