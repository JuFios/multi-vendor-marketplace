import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';

import { AuctionsController } from './auctions.controller';
import { AuctionsRepository } from './auctions.repository';
import { AuctionsService } from './auctions.service';
import { SellerAuctionsController } from './seller-auctions.controller';

@Module({
  imports: [SellersModule],
  controllers: [AuctionsController, SellerAuctionsController],
  providers: [AuctionsRepository, AuctionsService],
  exports: [AuctionsService],
})
export class BiddingModule {}
