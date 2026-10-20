import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { biddingConfig } from '../../config/bidding.config';

import { AuctionLifecycleService } from './auction-lifecycle.service';

const INTERVAL_NAME = 'auction-sweep';

/** Worker-only: every interval, closes and renews the auctions whose timers did not. */
@Injectable()
export class AuctionsSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuctionsSweeper.name);
  private running: Promise<void> | undefined;

  constructor(
    @Inject(biddingConfig.KEY) private readonly settings: ConfigType<typeof biddingConfig>,
    private readonly lifecycle: AuctionLifecycleService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => {
      // A tick that finds the previous one still running does nothing.
      this.running ??= this.sweep().finally(() => {
        this.running = undefined;
      });
    }, this.settings.sweepIntervalMs);
    this.scheduler.addInterval(INTERVAL_NAME, timer);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME);
    }
    await this.running;
  }

  private async sweep(): Promise<void> {
    try {
      const { closed, expired } = await this.lifecycle.sweep();
      if (closed + expired > 0) {
        this.logger.log({ msg: 'auction.swept', closed, expired });
      }
    } catch (error) {
      this.logger.error({
        msg: 'auction.sweep_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
