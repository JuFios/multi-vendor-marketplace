import { ApiProperty } from '@nestjs/swagger';

import { IsMoneyCents } from '../../../common/decorators/is-money-cents.decorator';

import { AuctionDto, BidDto } from './auction-response.dto';

export class PlaceBidDto {
  @ApiProperty({ minimum: 1, description: 'The bid in cents; at least `minNextBidCents`.' })
  @IsMoneyCents()
  amountCents: number;
}

/** Plain JSON: it is also stored as the replayed response. */
export class PlacedBidDto {
  @ApiProperty({ type: BidDto })
  bid: BidDto;

  @ApiProperty({ type: AuctionDto, description: 'The auction right after the bid.' })
  auction: AuctionDto;
}
