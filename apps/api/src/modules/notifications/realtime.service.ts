import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { AuctionsService } from '../bidding/auctions.service';
import { AuctionNotFoundError } from '../bidding/bidding.errors';

import { AUCTION_EVENT_TYPES, projectEvent } from './realtime-projection';
import { REALTIME_PUBLISHER, type RealtimePublisherPort } from './realtime-publisher.port';
import { WS_EVENT } from './ws-events';
import { toAuctionState } from './ws-mappers';
import { auctionRoom } from './ws-rooms';

type AuctionEventType = (typeof AUCTION_EVENT_TYPES)[number];

const isAuctionEvent = (
  event: AnyDomainEvent,
): event is Extract<AnyDomainEvent, { type: AuctionEventType }> =>
  (AUCTION_EVENT_TYPES as readonly string[]).includes(event.type);

/**
 * Turns a domain event into live pushes. Nothing here depends on how often or in what order
 * events arrive: auctions are re-read, so a late or repeated event pushes the current state,
 * and clients drop anything whose version is not newer than theirs.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly auctions: AuctionsService,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: RealtimePublisherPort,
  ) {}

  async publish(event: AnyDomainEvent): Promise<void> {
    if (isAuctionEvent(event)) {
      await this.publishAuction(event.payload.auctionId, event.correlationId);
      return;
    }
    for (const push of projectEvent(event)) {
      await this.publisher.emit(push.room, push.event, push.payload);
    }
  }

  private async publishAuction(auctionId: string, correlationId: string | null): Promise<void> {
    try {
      const state = toAuctionState(await this.auctions.getSnapshot(auctionId), correlationId);
      await this.publisher.emit(auctionRoom(auctionId), WS_EVENT.AUCTION_STATE, state);
    } catch (error) {
      if (error instanceof AuctionNotFoundError) {
        this.logger.warn({ msg: 'realtime.auction_missing', auctionId });
        return;
      }
      throw error;
    }
  }
}
