import { Module } from '@nestjs/common';

import { AuctionsSweeper } from './auctions-sweeper.service';
import { AuctionsProcessor } from './auctions.processor';
import { BiddingModule } from './bidding.module';

/** The auction timers and their sweeper; registered in the worker process only. */
@Module({ imports: [BiddingModule], providers: [AuctionsProcessor, AuctionsSweeper] })
export class BiddingWorkerModule {}
