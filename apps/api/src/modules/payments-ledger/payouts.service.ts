import { Injectable, Logger } from '@nestjs/common';

import { LedgerRepository } from './ledger.repository';
import { PayoutsRepository } from './payouts.repository';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly payouts: PayoutsRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  /**
   * Mock payout of a completed seller order: pays what the books still owe the seller for it,
   * which is exactly sale − commission − refunds, even if a refund came in after completion.
   * A second call for the same seller order, or an order that owes nothing, does nothing.
   */
  async payOut(sellerOrderId: string, sellerId: string): Promise<void> {
    const amountCents = await this.ledger.sumOfSellerOrder(sellerOrderId);
    if (amountCents <= 0) {
      return;
    }
    const payoutId = await this.payouts.createPaid(sellerOrderId, sellerId, amountCents);
    if (payoutId === null) {
      return;
    }
    await this.ledger.append([
      { sellerOrderId, sellerId, type: 'PAYOUT', amountCents: -amountCents, refId: payoutId },
    ]);
    this.logger.log({ msg: 'payout.paid', sellerOrderId, payoutId, amountCents });
  }
}
