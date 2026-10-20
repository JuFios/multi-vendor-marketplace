import { ApiProperty } from '@nestjs/swagger';

import { SellerOrderDto } from '../../orders/dto/order-response.dto';

export class SellerRevenueDto {
  @ApiProperty({ description: 'Orders not cancelled, placed in the period.' })
  ordersCount: number;

  @ApiProperty({ description: 'Items sold, in units.' })
  itemsCount: number;

  @ApiProperty({ description: 'Sales before refunds, in kopecks.' })
  grossCents: number;

  @ApiProperty()
  refundsCents: number;

  @ApiProperty({ description: 'The platform’s commission after refunds.' })
  commissionCents: number;

  @ApiProperty({ description: 'gross − refunds − commission.' })
  netCents: number;
}

export class SellerOrderStatusCountsDto {
  @ApiProperty()
  NEW: number;

  @ApiProperty()
  PROCESSING: number;

  @ApiProperty()
  SHIPPED: number;

  @ApiProperty()
  COMPLETED: number;

  @ApiProperty()
  CANCELLED: number;
}

export class ActiveLotDto {
  @ApiProperty({ format: 'uuid' })
  auctionId: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'The leading bid, or the starting price while there are no bids.' })
  currentPriceCents: number;

  @ApiProperty()
  bidCount: number;

  @ApiProperty({ format: 'date-time' })
  endsAt: string;
}

export class SellerDashboardDto {
  @ApiProperty({ example: '2026-03-01' })
  from: string;

  @ApiProperty({ example: '2026-03-30' })
  to: string;

  @ApiProperty({ type: SellerRevenueDto })
  revenue: SellerRevenueDto;

  @ApiProperty({
    type: SellerOrderStatusCountsDto,
    description: 'Seller orders placed in the period, by their status now.',
  })
  ordersByStatus: SellerOrderStatusCountsDto;

  @ApiProperty({ type: [SellerOrderDto], description: 'The five newest, whatever the period.' })
  recentOrders: SellerOrderDto[];

  @ApiProperty({
    type: [ActiveLotDto],
    description: 'Auctions taking bids now, ending first up front.',
  })
  activeLots: ActiveLotDto[];
}
