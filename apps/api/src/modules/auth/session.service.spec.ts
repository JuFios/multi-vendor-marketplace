import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { authConfig } from '../../config/auth.config';
import type { SellersService } from '../sellers/sellers.service';
import type { UserAccount } from '../users/user-account';
import type { UsersService } from '../users/users.service';

import type { AccessTokenService } from './access-token.service';
import { InvalidRefreshTokenError, RefreshTokenReusedError } from './auth.errors';
import type { AuthRepository, StoredRefreshToken } from './auth.repository';
import { hashRefreshToken } from './refresh-token';
import { SessionService } from './session.service';

const user: UserAccount = {
  id: 'user-1',
  email: 'buyer@example.com',
  name: 'Buyer',
  roles: ['CUSTOMER', 'SELLER'],
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const stored = (overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken => ({
  id: 'token-1',
  userId: user.id,
  familyId: 'family-1',
  revokedAt: null,
  replacedById: null,
  expired: false,
  ...overrides,
});

const client = { ip: '203.0.113.7', userAgent: 'jest' };

describe('SessionService', () => {
  const repository = {
    createRefreshToken: jest.fn(),
    lockRefreshToken: jest.fn(),
    findFamilyIdByHash: jest.fn(),
    markRotated: jest.fn(),
    revokeFamily: jest.fn(),
  };
  const users = { findById: jest.fn() };
  const sellers = { findApprovedSellerId: jest.fn() };
  const accessTokens = { issue: jest.fn() };
  const txHost = { withTransaction: jest.fn() };
  const config = { refreshTtlDays: 30 } as ConfigType<typeof authConfig>;
  let warn: jest.SpyInstance;
  let service: SessionService;

  beforeEach(() => {
    jest.resetAllMocks();
    txHost.withTransaction.mockImplementation((work: () => unknown) => work());
    repository.createRefreshToken.mockResolvedValue({
      id: 'token-2',
      expiresAt: new Date('2026-02-01T00:00:00Z'),
    });
    accessTokens.issue.mockResolvedValue({ token: 'jwt', expiresInSec: 900 });
    users.findById.mockResolvedValue(user);
    sellers.findApprovedSellerId.mockResolvedValue('seller-1');
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    service = new SessionService(
      txHost as never,
      accessTokens as unknown as AccessTokenService,
      repository as unknown as AuthRepository,
      users as unknown as UsersService,
      sellers as unknown as SellersService,
      config,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('start', () => {
    it('opens a new family and issues tokens with the roles of the user', async () => {
      const session = await service.start(user, client);

      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          ttlDays: 30,
          userAgent: 'jest',
          ip: client.ip,
        }),
      );
      expect(accessTokens.issue).toHaveBeenCalledWith({
        sub: user.id,
        roles: user.roles,
        sellerId: 'seller-1',
      });
      expect(session.accessToken).toBe('jwt');
      expect(hashRefreshToken(session.refreshToken)).toBe(
        (repository.createRefreshToken.mock.calls[0] as [{ tokenHash: string }])[0].tokenHash,
      );
      expect(repository.markRotated).not.toHaveBeenCalled();
    });
  });

  describe('store id in the access token', () => {
    it('is left out for a user without the SELLER role, without a store lookup', async () => {
      await service.start({ ...user, roles: ['CUSTOMER'] }, client);

      expect(accessTokens.issue).toHaveBeenCalledWith({ sub: user.id, roles: ['CUSTOMER'] });
      expect(sellers.findApprovedSellerId).not.toHaveBeenCalled();
    });

    it('is left out when the store is not approved', async () => {
      sellers.findApprovedSellerId.mockResolvedValue(undefined);

      await service.start(user, client);

      expect(accessTokens.issue).toHaveBeenCalledWith({ sub: user.id, roles: user.roles });
    });
  });

  describe('refresh', () => {
    it('rotates an active token within its family and marks the old one replaced', async () => {
      repository.lockRefreshToken.mockResolvedValue(stored());

      const session = await service.refresh('presented-token', client);

      expect(repository.lockRefreshToken).toHaveBeenCalledWith(hashRefreshToken('presented-token'));
      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: 'family-1', userId: user.id }),
      );
      expect(repository.markRotated).toHaveBeenCalledWith('token-1', 'token-2');
      expect(repository.revokeFamily).not.toHaveBeenCalled();
      expect(session.refreshToken).not.toBe('presented-token');
    });

    it('takes the roles and the store id from the database, not from the old session', async () => {
      repository.lockRefreshToken.mockResolvedValue(stored());
      users.findById.mockResolvedValue({ ...user, roles: ['CUSTOMER', 'SELLER', 'ADMIN'] });

      await service.refresh('presented-token', client);

      expect(accessTokens.issue).toHaveBeenCalledWith({
        sub: user.id,
        roles: ['CUSTOMER', 'SELLER', 'ADMIN'],
        sellerId: 'seller-1',
      });
    });

    it('revokes the whole family and logs when a rotated token is presented again', async () => {
      repository.lockRefreshToken.mockResolvedValue(
        stored({ revokedAt: new Date(), replacedById: 'token-2' }),
      );

      await expect(service.refresh('old-token', client)).rejects.toBeInstanceOf(
        RefreshTokenReusedError,
      );

      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith({
        msg: 'auth.refresh.reuse_detected',
        userId: user.id,
        familyId: 'family-1',
        ip: client.ip,
      });
    });

    it('rejects a token revoked by logout without touching the family or alarming', async () => {
      repository.lockRefreshToken.mockResolvedValue(stored({ revokedAt: new Date() }));

      await expect(service.refresh('logged-out', client)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );

      expect(repository.revokeFamily).not.toHaveBeenCalled();
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('commits the revocation instead of rolling it back with the error', async () => {
      repository.lockRefreshToken.mockResolvedValue(
        stored({ revokedAt: new Date(), replacedById: 'token-2' }),
      );
      let committed = false;
      txHost.withTransaction.mockImplementation(async (work: () => Promise<unknown>) => {
        const result = await work();
        committed = true;
        return result;
      });

      await service.refresh('old-token', client).catch(() => undefined);

      expect(committed).toBe(true);
    });

    it('rejects an unknown token without touching any family', async () => {
      repository.lockRefreshToken.mockResolvedValue(null);

      await expect(service.refresh('nope', client)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it('rejects an expired token without revoking the family', async () => {
      repository.lockRefreshToken.mockResolvedValue(stored({ expired: true }));

      await expect(service.refresh('old', client)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(repository.revokeFamily).not.toHaveBeenCalled();
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a token whose user no longer exists', async () => {
      repository.lockRefreshToken.mockResolvedValue(stored());
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('orphan', client)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('end', () => {
    it('revokes the family of a known token', async () => {
      repository.findFamilyIdByHash.mockResolvedValue('family-1');

      await service.end('token');

      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('ignores an unknown token', async () => {
      repository.findFamilyIdByHash.mockResolvedValue(null);

      await service.end('token');

      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });
  });
});
