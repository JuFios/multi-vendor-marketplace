import { ApiProperty } from '@nestjs/swagger';

export class StoreSalesDto {
  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty()
  storeName: string;

  @ApiProperty({ description: 'Orders not cancelled.' })
  ordersCount: number;

  @ApiProperty({ description: 'Items sold, in units.' })
  itemsCount: number;

  @ApiProperty({ description: 'Sales before refunds, in kopecks.' })
  grossCents: number;

  @ApiProperty()
  refundedCents: number;

  @ApiProperty({ description: 'gross − refunds: what the ranking is by.' })
  revenueCents: number;

  @ApiProperty({ description: 'Platform commission after refunds.' })
  commissionCents: number;

  @ApiProperty({ description: 'revenue − commission.' })
  netCents: number;
}

export class ProductSalesDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty({ description: 'Units sold.' })
  quantity: number;

  @ApiProperty()
  grossCents: number;

  @ApiProperty()
  refundedCents: number;

  @ApiProperty({ description: 'gross − refunds: what the ranking is by.' })
  revenueCents: number;
}

export class ConversionDto {
  @ApiProperty({ description: 'Carts that got their first item in the period.' })
  cartsWithItems: number;

  @ApiProperty({ description: 'Of those, carts that became an order.' })
  convertedCarts: number;

  @ApiProperty({ description: 'convertedCarts / cartsWithItems, 0 to 1.' })
  rate: number;
}

export class AnalyticsSummaryDto {
  @ApiProperty({ example: '2026-03-01' })
  from: string;

  @ApiProperty({ example: '2026-03-30' })
  to: string;

  @ApiProperty({ description: 'Sum of commissions after refunds and cancellations.' })
  platformRevenueCents: number;

  @ApiProperty()
  grossSalesCents: number;

  @ApiProperty()
  refundsCents: number;

  @ApiProperty({ description: 'Orders not cancelled.' })
  ordersCount: number;

  @ApiProperty({ type: [StoreSalesDto] })
  revenueBySeller: StoreSalesDto[];

  @ApiProperty({ type: [ProductSalesDto], description: 'Up to 5, by revenue.' })
  topProducts: ProductSalesDto[];

  @ApiProperty({ type: [StoreSalesDto], description: 'Up to 5, by revenue.' })
  topSellers: StoreSalesDto[];

  @ApiProperty({ type: ConversionDto })
  conversion: ConversionDto;
}

export class ChartDayDto {
  @ApiProperty({ example: '2026-03-01' })
  date: string;

  @ApiProperty()
  grossCents: number;

  @ApiProperty()
  commissionCents: number;

  @ApiProperty()
  ordersCount: number;
}

export class ChartTotalsDto {
  @ApiProperty()
  grossCents: number;

  @ApiProperty()
  commissionCents: number;

  @ApiProperty()
  ordersCount: number;
}

export class ChartDeltaDto {
  @ApiProperty({ nullable: true, type: Number })
  grossCents: number | null;

  @ApiProperty({ nullable: true, type: Number })
  commissionCents: number | null;

  @ApiProperty({ nullable: true, type: Number })
  ordersCount: number | null;
}

export class ChartTotalsPairDto {
  @ApiProperty({ type: ChartTotalsDto })
  current: ChartTotalsDto;

  @ApiProperty({ type: ChartTotalsDto })
  previous: ChartTotalsDto;

  @ApiProperty({
    type: ChartDeltaDto,
    description: 'Change from previous to current in percent; null when previous is zero.',
  })
  deltaPct: ChartDeltaDto;
}

export class SalesChartDto {
  @ApiProperty({ type: [ChartDayDto], description: 'One entry per day, oldest first.' })
  current: ChartDayDto[];

  @ApiProperty({ type: [ChartDayDto], description: 'The same number of days right before.' })
  previous: ChartDayDto[];

  @ApiProperty({ type: ChartTotalsPairDto })
  totals: ChartTotalsPairDto;
}
