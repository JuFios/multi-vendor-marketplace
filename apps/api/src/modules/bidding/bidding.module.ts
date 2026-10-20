import { Module } from '@nestjs/common';

import { IdempotencyModule } from '../../idempotency/idempotency.module';
import { SellersModule } from '../sellers/sellers.module';

import { AuctionsController } from './auctions.controller';
import { AuctionsRepository } from './auctions.repository';
import { AuctionsService } from './auctions.service';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { SellerAuctionsController } from './seller-auctions.controller';

@Module({
  imports: [IdempotencyModule, SellersModule],
  controllers: [AuctionsController, BidsController, SellerAuctionsController],
  providers: [AuctionsRepository, AuctionsService, BidsService],
  exports: [AuctionsService],
})
export class BiddingModule {}
