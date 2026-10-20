import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type {
  DisputeMessageRecord,
  DisputeParty,
  DisputeRecord,
  DisputeStatusValue,
  DisputeViewer,
  NewDispute,
} from './dispute';
import { DisputeAlreadyOpenError } from './disputes.errors';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class DisputesRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** The partial unique index lets one open dispute per seller order through, however many race. */
  async create(dispute: NewDispute): Promise<DisputeRecord> {
    try {
      return await this.txHost.tx.dispute.create({ data: dispute });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new DisputeAlreadyOpenError();
      }
      throw error;
    }
  }

  /** Visible to the customer and to the store of the seller order; an admin sees all. */
  async findVisible(id: string, viewer: DisputeViewer): Promise<DisputeRecord | null> {
    return this.txHost.tx.dispute.findFirst({ where: { id, ...visibility(viewer) } });
  }

  async listVisible(
    viewer: DisputeViewer,
    page: number,
    limit: number,
  ): Promise<{ items: DisputeRecord[]; total: number }> {
    const where = visibility(viewer);
    const [items, total] = await Promise.all([
      this.txHost.tx.dispute.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.dispute.count({ where }),
    ]);
    return { items, total };
  }

  /** Locks the dispute row and returns its status, so a message and a resolution take turns. */
  async lockStatus(id: string): Promise<DisputeStatusValue | null> {
    const rows = await this.txHost.tx.$queryRaw<{ status: DisputeStatusValue }[]>`
      SELECT status FROM disputes WHERE id = ${id}::uuid FOR UPDATE`;
    return rows[0]?.status ?? null;
  }

  addMessage(
    disputeId: string,
    authorId: string,
    authorRole: DisputeParty,
    text: string,
  ): Promise<DisputeMessageRecord> {
    return this.txHost.tx.disputeMessage.create({
      data: { disputeId, authorId, authorRole, text },
    });
  }

  listMessages(disputeId: string): Promise<DisputeMessageRecord[]> {
    return this.txHost.tx.disputeMessage.findMany({
      where: { disputeId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}

function visibility(viewer: DisputeViewer): Prisma.DisputeWhereInput {
  if (viewer.isAdmin) {
    return {};
  }
  return {
    OR: [
      { customerId: viewer.userId },
      ...(viewer.sellerId === undefined ? [] : [{ sellerId: viewer.sellerId }]),
    ],
  };
}
