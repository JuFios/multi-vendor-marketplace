import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { OutboxService } from '../../outbox';
import { EVENT_TYPE } from '../../outbox/events';
import type { AppTransactionHost } from '../../prisma';
import { UsersService } from '../users/users.service';

import type { ModerationDecision } from './moderation';
import {
  type ApplicationInput,
  decideApplication,
  type SellerApplication,
} from './seller-application';
import {
  SellerApplicationExistsError,
  SellerApplicationNotFoundError,
  SellerApplicationNotPendingError,
  SellerNotFoundError,
  StoreNameTakenError,
} from './sellers.errors';
import { type ApplicationFilter, SellersRepository, uniqueViolationOf } from './sellers.repository';

@Injectable()
export class SellersService {
  private readonly logger = new Logger(SellersService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly sellers: SellersRepository,
    private readonly users: UsersService,
    private readonly outbox: OutboxService,
  ) {}

  /** Creates the user's application, or reopens a rejected one (I-02). */
  async apply(userId: string, input: ApplicationInput): Promise<SellerApplication> {
    const decision = decideApplication(await this.sellers.findByUserId(userId));
    try {
      switch (decision.kind) {
        case 'create':
          return await this.sellers.create(userId, input);
        case 'resubmit': {
          const reopened = await this.sellers.resubmit(decision.applicationId, input);
          if (reopened === null) {
            throw new SellerApplicationExistsError();
          }
          return reopened;
        }
        case 'duplicate':
          throw new SellerApplicationExistsError();
      }
    } catch (error) {
      // A concurrent request may win either unique rule between the lookup and the write.
      switch (uniqueViolationOf(error)) {
        case 'store_name':
          throw new StoreNameTakenError();
        case 'user':
          throw new SellerApplicationExistsError();
        case null:
          throw error;
      }
    }
  }

  async getApplicationOf(userId: string): Promise<SellerApplication> {
    const application = await this.sellers.findByUserId(userId);
    if (!application) {
      throw new SellerApplicationNotFoundError();
    }
    return application;
  }

  /** Only approved stores are public; any other profile looks like a missing one. */
  async getPublicProfile(id: string): Promise<SellerApplication> {
    const seller = await this.sellers.findById(id);
    if (seller?.status !== 'APPROVED') {
      throw new SellerNotFoundError();
    }
    return seller;
  }

  /** The store id for the access token, or undefined when the user has no approved store. */
  async findApprovedSellerId(userId: string): Promise<string | undefined> {
    const profile = await this.sellers.findByUserId(userId);
    return profile?.status === 'APPROVED' ? profile.id : undefined;
  }

  /** The user who owns the store, whatever its moderation state; undefined for an unknown store. */
  async findOwnerId(sellerId: string): Promise<string | undefined> {
    return (await this.sellers.findById(sellerId))?.userId;
  }

  /** Whether the store is approved right now; always read from the database. */
  async isApproved(sellerId: string): Promise<boolean> {
    return (await this.sellers.findById(sellerId))?.status === 'APPROVED';
  }

  /** Store names by store id; stores that are not approved are left out. */
  findStoreNames(ids: readonly string[]): Promise<Map<string, string>> {
    return this.sellers.findApprovedNames(ids);
  }

  listApplications(
    filter: ApplicationFilter,
  ): Promise<{ items: SellerApplication[]; total: number }> {
    return this.sellers.list(filter);
  }

  /** Status, SELLER role and `seller.approved` change together or not at all. */
  async approve(adminId: string, id: string): Promise<SellerApplication> {
    const application = await this.txHost.withTransaction(async () => {
      const approved = await this.decide(adminId, id, { status: 'APPROVED' });
      await this.users.grantRole(approved.userId, 'SELLER');
      await this.outbox.add([
        {
          type: EVENT_TYPE.SELLER_APPROVED,
          aggregateType: 'Seller',
          aggregateId: approved.id,
          payload: { sellerId: approved.id, userId: approved.userId },
          actorId: adminId,
        },
      ]);
      return approved;
    });
    this.logger.log({ msg: 'moderation.seller.approved', adminId, sellerId: id });
    return application;
  }

  async reject(adminId: string, id: string, reason: string): Promise<SellerApplication> {
    const application = await this.txHost.withTransaction(async () => {
      const rejected = await this.decide(adminId, id, { status: 'REJECTED', reason });
      await this.outbox.add([
        {
          type: EVENT_TYPE.SELLER_REJECTED,
          aggregateType: 'Seller',
          aggregateId: rejected.id,
          payload: { sellerId: rejected.id, userId: rejected.userId, reason },
          actorId: adminId,
        },
      ]);
      return rejected;
    });
    this.logger.log({ msg: 'moderation.seller.rejected', adminId, sellerId: id, reason });
    return application;
  }

  private async decide(
    adminId: string,
    id: string,
    decision: ModerationDecision,
  ): Promise<SellerApplication> {
    const decided = await this.sellers.decide(id, adminId, decision);
    if (decided) {
      return decided;
    }
    throw (await this.sellers.findById(id))
      ? new SellerApplicationNotPendingError()
      : new SellerApplicationNotFoundError();
  }
}
