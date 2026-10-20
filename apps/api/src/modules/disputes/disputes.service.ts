import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { OrdersService } from '../orders/orders.service';

import { assertDisputable, assertOpen, type DisputeViewer, roleInDispute } from './dispute';
import { DisputeNotFoundError } from './disputes.errors';
import { DisputesRepository } from './disputes.repository';
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
}
