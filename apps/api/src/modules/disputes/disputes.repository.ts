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
  ResolutionOutcome,
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

  async findById(id: string): Promise<DisputeRecord | null> {
    return this.txHost.tx.dispute.findUnique({ where: { id } });
  }

  async listAll(
    status: DisputeStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: DisputeRecord[]; total: number }> {
    const where: Prisma.DisputeWhereInput = status === undefined ? {} : { status };
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

  /** OPEN → UNDER_REVIEW; false when the dispute was not OPEN. */
  async markUnderReview(id: string): Promise<boolean> {
    const { count } = await this.txHost.tx.dispute.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'UNDER_REVIEW' },
    });
    return count > 0;
  }

  /** Closes an unresolved dispute; the time is the database's, like every deadline. */
  async resolve(
    id: string,
    outcome: ResolutionOutcome,
    note: string,
    adminId: string,
  ): Promise<boolean> {
    const count = await this.txHost.tx.$executeRaw`
      UPDATE disputes
      SET status = ${outcome}::dispute_status, resolution_note = ${note},
          resolved_by_id = ${adminId}::uuid, resolved_at = now(), updated_at = now()
      WHERE id = ${id}::uuid AND status IN ('OPEN', 'UNDER_REVIEW')`;
    return count > 0;
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
