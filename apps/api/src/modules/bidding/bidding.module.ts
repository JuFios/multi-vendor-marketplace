import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { SellersModule } from '../sellers/sellers.module';

import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AuctionsController } from './auctions.controller';
import { AuctionsRepository } from './auctions.repository';
import { AuctionsService } from './auctions.service';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { SellerAuctionsController } from './seller-auctions.controller';

@Module({
  imports: [IdempotencyModule, SellersModule],
  controllers: [AuctionsController, BidsController, SellerAuctionsController],
  providers: [AuctionsRepository, AuctionsService, AuctionLifecycleService, BidsService],
  exports: [AuctionsService, AuctionLifecycleService],
})
export class BiddingModule {}
