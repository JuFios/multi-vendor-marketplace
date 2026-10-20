import type { AuctionDto } from '../bidding/dto/auction-response.dto';
import type { ProductStockResponseDto } from '../products/dto/product-details-response.dto';

import type { AuctionStatePayload, ProductStockPayload } from './ws-events';

export function toAuctionState(
  auction: AuctionDto,
  correlationId?: string | null,
): AuctionStatePayload {
  return {
    auctionId: auction.id,
    productId: auction.productId,
    round: auction.round,
    status: auction.status as AuctionStatePayload['status'],
    currentPriceCents: auction.currentPriceCents,
    minNextBidCents: auction.minNextBidCents,
    bidCount: auction.bidCount,
    leader: auction.leader,
    endsAt: auction.endsAt,
    winnerDeadlineAt: auction.winnerDeadlineAt,
    version: auction.version,
    serverTime: auction.serverTime,
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}

export function toProductStock(
  productId: string,
  stock: ProductStockResponseDto,
  correlationId?: string | null,
): ProductStockPayload {
  return {
    productId,
    stock: stock.stock,
    inStock: stock.inStock,
    version: stock.version,
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}
