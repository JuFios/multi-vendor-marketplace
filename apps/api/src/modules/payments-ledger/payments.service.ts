import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { PAYMENT_REFUNDS_TOTAL } from '../../metrics/metrics.constants';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';

import {
  type AdminPaymentRefundsQueryDto,
  PaymentRefundDto,
  type PaymentRefundPageDto,
} from './dto/payment-refund.dto';
import { PaymentAttemptsRepository } from './payment-attempts.repository';
import {
  type CaptureResult,
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
  type RefundResult,
} from './payment-gateway.port';
import { PaymentRefundsRepository } from './payment-refunds.repository';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    private readonly attempts: PaymentAttemptsRepository,
    private readonly refunds: PaymentRefundsRepository,
    private readonly outbox: OutboxService,
    @InjectMetric(PAYMENT_REFUNDS_TOTAL) private readonly refundOutcomes: Counter<'status'>,
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

  /**
   * Asks for money to go back to the buyer, in the caller's transaction: the request commits
   * with the books it belongs to, and `refund` carries it out afterwards. Nothing is asked for
   * when there is nothing to give back.
   */
  async requestRefund(
    sellerOrderId: string,
    amountCents: number,
    reason: 'REFUND' | 'CANCELLATION' | 'LATE_CAPTURE',
  ): Promise<void> {
    if (amountCents <= 0) {
      return;
    }
    await this.outbox.add([
      {
        type: EVENT_TYPE.PAYMENT_REFUND_REQUESTED,
        aggregateType: 'SellerOrder',
        aggregateId: sellerOrderId,
        payload: { sellerOrderId, amountCents, reason },
      },
    ]);
  }

  /**
   * Gives the money back through the gateway. Like `capture` it stays outside any database
   * transaction, and the request's event id as `refundKey` makes a repeat harmless.
   */
  refund(sellerOrderId: string, refundKey: string, amountCents: number): Promise<RefundResult> {
    return this.gateway.refund({ sellerOrderId, refundKey, amountCents });
  }

  /**
   * Whether the gateway's answer to this refund request is stored already. The answer commits
   * with the consumer's inbox row, so a stored one means the request was carried out: a
   * redelivery must not reach the gateway again, whose idempotency keys may have expired by then.
   */
  isRefundRecorded(refundKey: string): Promise<boolean> {
    return this.refunds.existsByRefundKey(refundKey);
  }

  /** The gateway's answers for the admin, newest first; FAILED ones need a person. */
  async listRefunds(query: AdminPaymentRefundsQueryDto): Promise<PaymentRefundPageDto> {
    const { items, total } = await this.refunds.list(
      query.status === undefined ? {} : { status: query.status },
      query.page,
      query.limit,
    );
    return {
      items: items.map((item) => PaymentRefundDto.from(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Records the gateway's answer in the caller's transaction. A refusal needs a person. */
  async recordRefund(
    sellerOrderId: string,
    refundKey: string,
    amountCents: number,
    result: RefundResult,
  ): Promise<void> {
    await this.refunds.create({
      refundKey,
      sellerOrderId,
      amountCents,
      status: result.ok ? 'REFUNDED' : 'FAILED',
      providerRef: result.ok ? result.providerRef : null,
      failureReason: result.ok ? null : result.reason,
    });
    this.refundOutcomes.inc({ status: result.ok ? 'refunded' : 'failed' });
    if (result.ok) {
      this.logger.log({ msg: 'payment.refunded', sellerOrderId, amountCents });
    } else {
      this.logger.error({
        msg: 'payment.refund_failed',
        sellerOrderId,
        amountCents,
        reason: result.reason,
      });
    }
  }
}
