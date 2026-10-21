import type { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';

describe('LedgerService.recordCancellation', () => {
  const append = jest.fn<Promise<void>, Parameters<LedgerRepository['append']>>();
  const service = new LedgerService({ append } as unknown as LedgerRepository);
  const base = { sellerOrderId: 'so-1', sellerId: 'seller-1' };

  beforeEach(() => append.mockReset().mockResolvedValue(undefined));

  it('reverses the unrefunded sale and the commission', async () => {
    await service.recordCancellation({ ...base, releasedCents: 10_000, commissionCents: 500 });

    expect(append).toHaveBeenCalledWith([
      { ...base, type: 'CANCELLATION', amountCents: -10_000 },
      { ...base, type: 'COMMISSION_REVERSAL', amountCents: 500 },
    ]);
  });

  it('writes nothing when the order was fully refunded already', async () => {
    await service.recordCancellation({ ...base, releasedCents: 0, commissionCents: 0 });

    expect(append).not.toHaveBeenCalled();
  });

  it('skips the sale row but still returns a remaining commission', async () => {
    await service.recordCancellation({ ...base, releasedCents: 0, commissionCents: 30 });

    expect(append).toHaveBeenCalledWith([
      { ...base, type: 'COMMISSION_REVERSAL', amountCents: 30 },
    ]);
  });
});
