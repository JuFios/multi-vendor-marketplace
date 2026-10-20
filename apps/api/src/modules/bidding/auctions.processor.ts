import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { IdempotentProcessor } from '../../outbox/idempotent.processor';
import { QUEUE } from '../../queue/queue-names';

import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AUCTION_JOB, type AuctionTimerData } from './bidding.constants';

/**
 * Keeps the clocks of the auctions. Starting a round sets a delayed job that closes it; closing
 * with a winner sets one that ends the winner's checkout window. The jobs live in the same queue
 * as the events and are told apart by name. A job that never runs, or runs early, is made up for
 * by the sweeper, so a lost timer delays a close but never loses it.
 */
@Processor(QUEUE.AUCTIONS)
export class AuctionsProcessor extends IdempotentProcessor {
  protected readonly consumerName = 'auctions';
  protected readonly queue = QUEUE.AUCTIONS;
  protected readonly eventTypes = [EVENT_TYPE.AUCTION_STARTED, EVENT_TYPE.AUCTION_CLOSED] as const;

  private readonly timerLogger = new Logger('AuctionTimers');

  constructor(
    @InjectQueue(QUEUE.AUCTIONS) private readonly timers: Queue,
    private readonly lifecycle: AuctionLifecycleService,
  ) {
    super();
  }

  override async process(job: Job<AnyDomainEvent>): Promise<void> {
    if (job.name === AUCTION_JOB.CLOSE) {
      const { auctionId } = job.data as unknown as AuctionTimerData;
      await this.lifecycle.closeIfDue(auctionId);
      return;
    }
    if (job.name === AUCTION_JOB.EXPIRE) {
      const { auctionId } = job.data as unknown as AuctionTimerData;
      await this.lifecycle.expireIfDue(auctionId);
      return;
    }
    await super.process(job);
  }

  protected async handle(event: AnyDomainEvent): Promise<void> {
    if (event.type === EVENT_TYPE.AUCTION_STARTED) {
      const { auctionId, round, endsAt } = event.payload;
      await this.schedule(AUCTION_JOB.CLOSE, auctionId, round, new Date(endsAt));
    } else if (
      event.type === EVENT_TYPE.AUCTION_CLOSED &&
      event.payload.outcome === 'SOLD_TO_WINNER' &&
      event.payload.winnerDeadlineAt !== undefined
    ) {
      const { auctionId, round, winnerDeadlineAt } = event.payload;
      await this.schedule(AUCTION_JOB.EXPIRE, auctionId, round, new Date(winnerDeadlineAt));
    }
  }

  /**
   * One timer per auction, round and kind: the job id makes scheduling twice a no-op. The delay
   * only has to be about right; the database decides whether the moment has come.
   */
  private async schedule(
    name: (typeof AUCTION_JOB)[keyof typeof AUCTION_JOB],
    auctionId: string,
    round: number,
    at: Date,
  ): Promise<void> {
    const delay = Math.max(0, at.getTime() - Date.now()) + TIMER_MARGIN_MS;
    const data: AuctionTimerData = { auctionId, round };
    await this.timers.add(name, data, { jobId: `${name}-${auctionId}-${round}`, delay });
    this.timerLogger.log({
      msg: 'auction.timer_set',
      timer: name,
      auctionId,
      round,
      delayMs: delay,
    });
  }
}

/** Fires a little late rather than early, so the database clock has surely reached the deadline. */
const TIMER_MARGIN_MS = 100;
