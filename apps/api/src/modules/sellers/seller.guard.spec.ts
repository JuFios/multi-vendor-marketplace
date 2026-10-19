import type { ExecutionContext } from '@nestjs/common';

import { ForbiddenError } from '../../common/exceptions';

import { SellerGuard } from './seller.guard';
import type { SellersService } from './sellers.service';

const contextFor = (user: object | undefined): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('SellerGuard', () => {
  const sellers = { isApproved: jest.fn() };
  const guard = new SellerGuard(sellers as unknown as SellersService);
  const seller = { userId: 'u-1', roles: ['CUSTOMER', 'SELLER'], sellerId: 's-1' };

  beforeEach(() => jest.resetAllMocks());

  it('allows a SELLER whose store is approved', async () => {
    sellers.isApproved.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor(seller))).resolves.toBe(true);
    expect(sellers.isApproved).toHaveBeenCalledWith('s-1');
  });

  it.each([
    ['the store is not approved', seller, false],
    ['the role is missing', { ...seller, roles: ['CUSTOMER'] }, true],
    ['the token has no store id', { userId: 'u-1', roles: ['SELLER'] }, true],
    ['there is no user', undefined, true],
  ])('rejects with SELLER_NOT_APPROVED when %s', async (_label, user, approved) => {
    sellers.isApproved.mockResolvedValue(approved);

    const error: unknown = await guard.canActivate(contextFor(user)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).code).toBe('SELLER_NOT_APPROVED');
  });
});
