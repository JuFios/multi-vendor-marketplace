import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { analyticsConfig } from '../../config/analytics.config';
import { SalesFactsService } from '../orders/sales-facts.service';

import { SalesDailyRepository } from './sales-daily.repository';
import { cancellationDelta, refundDelta, saleDelta } from './sales-delta';

/** Keeps the daily sales read models in step with the order events. */
@Injectable()
export class SalesProjectionService {
  constructor(
    private readonly facts: SalesFactsService,
    private readonly daily: SalesDailyRepository,
    @Inject(analyticsConfig.KEY) private readonly settings: ConfigType<typeof analyticsConfig>,
  ) {}

  async onSellerOrderCreated(sellerOrderId: string): Promise<void> {
    const sale = await this.facts.ofSale(sellerOrderId, this.settings.timeZone);
    await this.daily.apply(saleDelta(sale));
  }

  async onSellerOrderCancelled(sellerOrderId: string): Promise<void> {
    const sale = await this.facts.ofSale(sellerOrderId, this.settings.timeZone);
    await this.daily.apply(cancellationDelta(sale));
  }

  async onRefundsCreated(sellerOrderId: string, refundIds: readonly string[]): Promise<void> {
    const refund = await this.facts.ofRefunds(sellerOrderId, refundIds, this.settings.timeZone);
    await this.daily.apply(refundDelta(refund));
  }
}
