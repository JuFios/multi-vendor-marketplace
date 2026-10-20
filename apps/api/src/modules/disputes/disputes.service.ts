import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { IdempotencyService } from '../../idempotency/idempotency.service';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { OrdersService } from '../orders/orders.service';
import { RefundService } from '../orders/refund.service';
import { SellerOrderLifecycleService } from '../orders/seller-order-lifecycle.service';

import {
  assertDisputable,
  assertOpen,
  assertValidResolution,
  type DisputeRecord,
  type DisputeStatusValue,
  type DisputeViewer,
  type Resolution,
  roleInDispute,
} from './dispute';
import { DisputeAlreadyUnderReviewError, DisputeNotFoundError } from './disputes.errors';
import { DisputesRepository } from './disputes.repository';
import { ResolveDisputeResultDto } from './dto/admin-dispute.dto';
import {
  DisputeDetailsDto,
  DisputeDto,
  DisputeMessageDto,
  DisputePageDto,
} from './dto/dispute.dto';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly disputes: DisputesRepository,
    private readonly orders: OrdersService,
    private readonly refunds: RefundService,
    private readonly lifecycle: SellerOrderLifecycleService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
  ) {}

  /** Only the customer who placed the order can open a dispute on one of its seller orders. */
  async open(customerId: string, sellerOrderId: string, reason: string): Promise<DisputeDto> {
    const target = await this.orders.getHeaderOfCustomer(customerId, sellerOrderId);
    assertDisputable(target.status);
    const dispute = await this.txHost.withTransaction(async () => {
      const created = await this.disputes.create({
        orderId: target.orderId,
        sellerOrderId: target.id,
        customerId,
        sellerId: target.sellerId,
        reason,
      });
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_OPENED,
          aggregateType: 'Dispute',
          aggregateId: created.id,
          payload: {
            disputeId: created.id,
            sellerOrderId: created.sellerOrderId,
            customerId,
            sellerId: created.sellerId,
          },
          actorId: customerId,
        },
      ]);
      return created;
    });
    this.logger.log({ msg: 'dispute.opened', disputeId: dispute.id, sellerOrderId: target.id });
    return DisputeDto.from(dispute);
  }

  async list(viewer: DisputeViewer, page: number, limit: number): Promise<DisputePageDto> {
    const { items, total } = await this.disputes.listVisible(viewer, page, limit);
    return { items: items.map((item) => DisputeDto.from(item)), total, page, limit };
  }

  async get(viewer: DisputeViewer, id: string): Promise<DisputeDetailsDto> {
    const dispute = await this.disputes.findVisible(id, viewer);
    if (dispute === null) {
      throw new DisputeNotFoundError();
    }
    return DisputeDetailsDto.withMessages(dispute, await this.disputes.listMessages(id));
  }

  /** The customer, the store of the seller order and admins can write until the dispute is resolved. */
  async addMessage(viewer: DisputeViewer, id: string, text: string): Promise<DisputeMessageDto> {
    const dispute = await this.disputes.findVisible(id, viewer);
    const role = dispute && roleInDispute(dispute, viewer);
    if (dispute === null || role === null) {
      throw new DisputeNotFoundError();
    }
    const message = await this.txHost.withTransaction(async () => {
      const status = await this.disputes.lockStatus(id);
      if (status === null) {
        throw new DisputeNotFoundError();
      }
      assertOpen(status);
      const created = await this.disputes.addMessage(id, viewer.userId, role, text);
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_MESSAGE_ADDED,
          aggregateType: 'Dispute',
          aggregateId: id,
          payload: {
            disputeId: id,
            sellerOrderId: dispute.sellerOrderId,
            customerId: dispute.customerId,
            sellerId: dispute.sellerId,
            authorRole: role,
          },
          actorId: viewer.userId,
        },
      ]);
      return created;
    });
    this.logger.log({ msg: 'dispute.message_added', disputeId: id, authorRole: role });
    return DisputeMessageDto.from(message);
  }

  async listAll(
    status: DisputeStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<DisputePageDto> {
    const { items, total } = await this.disputes.listAll(status, page, limit);
    return { items: items.map((item) => DisputeDto.from(item)), total, page, limit };
  }

  async startReview(id: string): Promise<DisputeDto> {
    const dispute = await this.txHost.withTransaction(async () => {
      const status = await this.disputes.lockStatus(id);
      if (status === null) {
        throw new DisputeNotFoundError();
      }
      assertOpen(status);
      if (status === 'UNDER_REVIEW') {
        throw new DisputeAlreadyUnderReviewError();
      }
      await this.disputes.markUnderReview(id);
      return this.requireDispute(id);
    });
    this.logger.log({ msg: 'dispute.under_review', disputeId: id });
    return DisputeDto.from(dispute);
  }

  /**
   * The decision, the optional refund, the optional final status of the seller order, the event
   * and the recorded idempotent response commit together: a dispute is never half resolved.
   */
  async resolve(
    adminId: string,
    id: string,
    resolution: Resolution,
  ): Promise<ResolveDisputeResultDto> {
    assertValidResolution(resolution);
    const result = await this.txHost.withTransaction(async () => {
      const status = await this.disputes.lockStatus(id);
      if (status === null) {
        throw new DisputeNotFoundError();
      }
      assertOpen(status);
      const dispute = await this.requireDispute(id);
      const actor = { type: 'ADMIN', userId: adminId } as const;

      const refund =
        resolution.refundItems === undefined || resolution.refundItems.length === 0
          ? null
          : await this.refunds.applyRefund(
              dispute.sellerOrderId,
              { items: resolution.refundItems, reason: resolution.note, disputeId: id },
              actor,
              {},
            );
      await this.applyFinalStatus(dispute.sellerOrderId, resolution, actor);

      await this.disputes.resolve(id, resolution.outcome, resolution.note, adminId);
      await this.outbox.add([
        {
          type: EVENT_TYPE.DISPUTE_RESOLVED,
          aggregateType: 'Dispute',
          aggregateId: id,
          payload: {
            disputeId: id,
            sellerOrderId: dispute.sellerOrderId,
            customerId: dispute.customerId,
            sellerId: dispute.sellerId,
            outcome: resolution.outcome,
          },
          actorId: adminId,
        },
      ]);
      const response: ResolveDisputeResultDto = {
        dispute: DisputeDto.from(await this.requireDispute(id)),
        refund,
        sellerOrder: await this.orders.getAnySellerOrder(dispute.sellerOrderId),
      };
      await this.idempotency.complete(response);
      return response;
    });
    this.logger.log({
      msg: 'dispute.resolved',
      disputeId: id,
      outcome: resolution.outcome,
      refundedCents: result.refund?.amountCents ?? 0,
      sellerOrderStatus: result.sellerOrder.status,
    });
    return result;
  }

  private async applyFinalStatus(
    sellerOrderId: string,
    resolution: Resolution,
    actor: { readonly type: 'ADMIN'; readonly userId: string },
  ): Promise<void> {
    const target = resolution.sellerOrderFinalStatus;
    if (target === undefined) {
      return;
    }
    if ((await this.orders.getAnySellerOrder(sellerOrderId)).status === target) {
      return;
    }
    if (target === 'CANCELLED') {
      await this.lifecycle.cancel(sellerOrderId, resolution.note, actor, {}, { viaDispute: true });
    } else {
      await this.lifecycle.changeStatus(sellerOrderId, target, actor, {});
    }
  }

  private async requireDispute(id: string): Promise<DisputeRecord> {
    const dispute = await this.disputes.findById(id);
    if (dispute === null) {
      throw new DisputeNotFoundError();
    }
    return dispute;
  }
}
