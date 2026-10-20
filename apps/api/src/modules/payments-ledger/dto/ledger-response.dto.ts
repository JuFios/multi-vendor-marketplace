import { ApiProperty } from '@nestjs/swagger';

import type { FinanceSummary } from '../finance-summary';
import type { LedgerEntryRecord } from '../ledger.repository';

const LEDGER_TYPES = [
  'SALE',
  'COMMISSION',
  'REFUND',
  'COMMISSION_REVERSAL',
  'CANCELLATION',
  'PAYOUT',
] as const;

export class FinanceSummaryDto implements FinanceSummary {
  @ApiProperty({ description: 'Sales booked in the period, in kopecks.' })
  grossCents: number;

  @ApiProperty({ description: 'Given back to buyers in the period: refunds and cancelled sales.' })
  refundsCents: number;

  @ApiProperty({ description: 'Platform commission in the period, net of reversals.' })
  commissionCents: number;

  @ApiProperty({ description: 'gross − refunds − commission.' })
  netCents: number;

  @ApiProperty({ description: 'Paid out to the store in the period.' })
  paidOutCents: number;

  @ApiProperty({ description: 'Everything the platform owes the store now, over all time.' })
  balanceCents: number;
}

export class LedgerEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sellerOrderId: string;

  @ApiProperty({ format: 'uuid' })
  sellerId: string;

  @ApiProperty({ enum: LEDGER_TYPES })
  type: string;

  @ApiProperty({ description: 'Signed from the store’s point of view; positive is owed to it.' })
  amountCents: number;

  @ApiProperty({ nullable: true, type: String, description: 'The refund or payout it stems from.' })
  refId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(record: LedgerEntryRecord): LedgerEntryDto {
    return { ...record, createdAt: record.createdAt.toISOString() };
  }
}

export class LedgerPageDto {
  @ApiProperty({ type: [LedgerEntryDto] })
  items: LedgerEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
