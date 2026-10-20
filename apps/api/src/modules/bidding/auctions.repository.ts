import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import type { AppTransactionHost } from '../../prisma/transaction';

import type { AuctionRecord, AuctionStatus, BidRecord } from './auction';

interface AuctionRow {
  id: string;
  product_id: string;
  seller_id: string;
  start_price_cents: number;
  bid_step_cents: number;
  duration_sec: number;
  round: number;
  status: AuctionStatus;
  ends_at: Date;
  current_price_cents: number | null;
  highest_bid_id: string | null;
  highest_bidder_id: string | null;
  bid_count: number;
  winner_id: string | null;
  winner_deadline_at: Date | null;
  version: number;
  created_at: Date;
  db_now: Date;
}

export const toAuction = (row: AuctionRow): AuctionRecord => ({
  id: row.id,
  productId: row.product_id,
  sellerId: row.seller_id,
  startPriceCents: row.start_price_cents,
  bidStepCents: row.bid_step_cents,
  durationSec: row.duration_sec,
  round: row.round,
  status: row.status,
  endsAt: row.ends_at,
  currentPriceCents: row.current_price_cents,
  highestBidId: row.highest_bid_id,
  highestBidderId: row.highest_bidder_id,
  bidCount: row.bid_count,
  winnerId: row.winner_id,
  winnerDeadlineAt: row.winner_deadline_at,
  version: row.version,
  createdAt: row.created_at,
  dbNow: row.db_now,
});

export interface NewAuction {
  readonly productId: string;
  readonly sellerId: string;
  readonly startPriceCents: number;
  readonly bidStepCents: number;
  readonly durationSec: number;
  readonly endsAt: Date;
}

/**
 * Owns `auctions` and `bids`. Every deadline comparison runs on the database clock, and every
 * auction is read together with that clock so callers never mix it with the application's.
 */
@Injectable()
export class AuctionsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** Whole seconds, rounded up, from the database's now until `endsAt`. */
  async secondsUntil(endsAt: Date): Promise<number> {
    const rows = await this.txHost.tx.$queryRaw<{ seconds: number }[]>`
      SELECT ceil(extract(epoch FROM (${endsAt}::timestamp - now()::timestamp)))::int AS seconds`;
    return rows[0]?.seconds ?? 0;
  }

  async insert(auction: NewAuction): Promise<AuctionRecord> {
    const rows = await this.txHost.tx.$queryRaw<AuctionRow[]>`
      INSERT INTO auctions (id, product_id, seller_id, start_price_cents, bid_step_cents,
                            duration_sec, ends_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${auction.productId}::uuid, ${auction.sellerId}::uuid,
              ${auction.startPriceCents}, ${auction.bidStepCents}, ${auction.durationSec},
              ${auction.endsAt}, now(), now())
      RETURNING *, now() AS db_now`;
    return toAuction(rows[0]!);
  }

  async findById(id: string): Promise<AuctionRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<AuctionRow[]>`
      SELECT *, now() AS db_now FROM auctions WHERE id = ${id}::uuid`;
    return rows[0] ? toAuction(rows[0]) : null;
  }

  async listOfSeller(
    sellerId: string,
    page: number,
    limit: number,
  ): Promise<{ items: AuctionRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.txHost.tx.$queryRaw<AuctionRow[]>`
        SELECT *, now() AS db_now FROM auctions
        WHERE seller_id = ${sellerId}::uuid
        ORDER BY created_at DESC, id ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.txHost.tx.auction.count({ where: { sellerId } }),
    ]);
    return { items: rows.map(toAuction), total };
  }

  /**
   * Makes the bid the leading one, but only while the auction is still in the state the bidder
   * saw (`version`), is ACTIVE and has not reached its deadline on the database clock. Null
   * when any of that no longer holds; then nothing was written.
   *
   * This and the close of the auction are conditional UPDATEs of one row, so the row lock
   * puts every bid either before the close or after it, never both.
   *
   * The bid row and the auction update are one statement. Inserting the bid first would take a
   * shared lock on the auction row (foreign key) that two concurrent bidders then hold while
   * both wait to update it: a deadlock. In one statement the update takes the exclusive lock
   * first, and the foreign keys are checked once both rows exist.
   */
  async placeBid(
    auctionId: string,
    version: number,
    bidderId: string,
    amountCents: number,
  ): Promise<{ auction: AuctionRecord; bid: BidRecord } | null> {
    const bidId = randomUUID();
    const rows = await this.txHost.tx.$queryRaw<(AuctionRow & { bid_created_at: Date })[]>`
      WITH advanced AS (
        UPDATE auctions
        SET current_price_cents = ${amountCents}, highest_bid_id = ${bidId}::uuid,
            highest_bidder_id = ${bidderId}::uuid, bid_count = bid_count + 1,
            version = version + 1, updated_at = now()
        WHERE id = ${auctionId}::uuid AND version = ${version} AND status = 'ACTIVE'
          AND ends_at > now()
        RETURNING *
      ), inserted AS (
        INSERT INTO bids (id, auction_id, round, bidder_id, amount_cents, created_at)
        SELECT ${bidId}::uuid, id, round, ${bidderId}::uuid, ${amountCents}, now()
        FROM advanced
        RETURNING created_at
      )
      SELECT advanced.*, now() AS db_now, (SELECT created_at FROM inserted) AS bid_created_at
      FROM advanced`;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const auction = toAuction(row);
    return {
      auction,
      bid: {
        id: bidId,
        auctionId,
        round: auction.round,
        bidderId,
        amountCents,
        createdAt: row.bid_created_at,
      },
    };
  }

  /** The bids of one round, highest first (which is also newest first). */
  async listBids(
    auctionId: string,
    round: number,
    page: number,
    limit: number,
  ): Promise<{ items: BidRecord[]; total: number }> {
    const where = { auctionId, round };
    const [items, total] = await Promise.all([
      this.txHost.tx.bid.findMany({
        where,
        orderBy: [{ amountCents: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.bid.count({ where }),
    ]);
    return { items, total };
  }
}
