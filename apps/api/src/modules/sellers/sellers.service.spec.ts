import { Logger } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import type { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import type { UsersService } from '../users/users.service';

import type { SellerApplication } from './seller-application';
import {
  SellerApplicationExistsError,
  SellerApplicationNotFoundError,
  SellerApplicationNotPendingError,
  SellerNotFoundError,
  StoreNameTakenError,
} from './sellers.errors';
import type { SellersRepository } from './sellers.repository';
import { SellersService } from './sellers.service';

const application = (overrides: Partial<SellerApplication> = {}): SellerApplication => ({
  id: 'seller-1',
  userId: 'user-1',
  storeName: 'Corner Shop',
  description: null,
  status: 'PENDING',
  rejectionReason: null,
  moderatedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const input = { storeName: 'Corner Shop', description: null };

const uniqueViolationOn = (index: string) =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });

describe('SellersService', () => {
  const repository = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    resubmit: jest.fn(),
    decide: jest.fn(),
  };
  const users = { grantRole: jest.fn() };
  const outbox = { add: jest.fn() };
  const calls: string[] = [];
  const txHost = { withTransaction: jest.fn<Promise<unknown>, [() => Promise<unknown>]>() };
  let service: SellersService;
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    calls.length = 0;
    txHost.withTransaction.mockImplementation(async (work) => {
      calls.push('begin');
      const result = await work();
      calls.push('commit');
      return result;
    });
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    service = new SellersService(
      txHost as unknown as AppTransactionHost,
      repository as unknown as SellersRepository,
      users as unknown as UsersService,
      outbox as unknown as OutboxService,
    );
  });

  describe('apply', () => {
    it('creates an application for a user without a profile', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.create.mockResolvedValue(application());

      await expect(service.apply('user-1', input)).resolves.toEqual(application());
      expect(repository.create).toHaveBeenCalledWith('user-1', input);
    });

    it('reopens a rejected application', async () => {
      repository.findByUserId.mockResolvedValue(application({ status: 'REJECTED' }));
      repository.resubmit.mockResolvedValue(application());

      await expect(service.apply('user-1', input)).resolves.toEqual(application());
      expect(repository.resubmit).toHaveBeenCalledWith('seller-1', input);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'APPROVED'] as const)(
      'refuses a second application while %s',
      async (status) => {
        repository.findByUserId.mockResolvedValue(application({ status }));

        await expect(service.apply('user-1', input)).rejects.toBeInstanceOf(
          SellerApplicationExistsError,
        );
      },
    );

    it('refuses when the rejected application was reopened concurrently', async () => {
      repository.findByUserId.mockResolvedValue(application({ status: 'REJECTED' }));
      repository.resubmit.mockResolvedValue(null);

      await expect(service.apply('user-1', input)).rejects.toBeInstanceOf(
        SellerApplicationExistsError,
      );
    });

    it('reports a taken store name', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.create.mockRejectedValue(uniqueViolationOn('seller_profiles_store_name_key'));

      await expect(service.apply('user-1', input)).rejects.toBeInstanceOf(StoreNameTakenError);
    });

    it('reports a concurrent application by the same user', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.create.mockRejectedValue(uniqueViolationOn('seller_profiles_user_id_key'));

      await expect(service.apply('user-1', input)).rejects.toBeInstanceOf(
        SellerApplicationExistsError,
      );
    });

    it('rethrows unrelated failures', async () => {
      const failure = new Error('connection lost');
      repository.findByUserId.mockResolvedValue(null);
      repository.create.mockRejectedValue(failure);

      await expect(service.apply('user-1', input)).rejects.toBe(failure);
    });
  });

  describe('getApplicationOf', () => {
    it('returns the application', async () => {
      repository.findByUserId.mockResolvedValue(application());

      await expect(service.getApplicationOf('user-1')).resolves.toEqual(application());
    });

    it('fails when the user never applied', async () => {
      repository.findByUserId.mockResolvedValue(null);

      await expect(service.getApplicationOf('user-1')).rejects.toBeInstanceOf(
        SellerApplicationNotFoundError,
      );
    });
  });

  describe('getPublicProfile', () => {
    it('returns an approved store', async () => {
      repository.findById.mockResolvedValue(application({ status: 'APPROVED' }));

      await expect(service.getPublicProfile('seller-1')).resolves.toMatchObject({ id: 'seller-1' });
    });

    it.each([null, application({ status: 'PENDING' }), application({ status: 'REJECTED' })])(
      'hides %p',
      async (stored) => {
        repository.findById.mockResolvedValue(stored);

        await expect(service.getPublicProfile('seller-1')).rejects.toBeInstanceOf(
          SellerNotFoundError,
        );
      },
    );
  });

  describe('findApprovedSellerId', () => {
    it('returns the id of an approved store', async () => {
      repository.findByUserId.mockResolvedValue(application({ status: 'APPROVED' }));

      await expect(service.findApprovedSellerId('user-1')).resolves.toBe('seller-1');
    });

    it.each([null, application({ status: 'PENDING' }), application({ status: 'REJECTED' })])(
      'returns nothing for %p',
      async (stored) => {
        repository.findByUserId.mockResolvedValue(stored);

        await expect(service.findApprovedSellerId('user-1')).resolves.toBeUndefined();
      },
    );
  });

  describe('isApproved', () => {
    it('reads the database every time, so a revoked approval takes effect at once', async () => {
      repository.findById.mockResolvedValueOnce(application({ status: 'APPROVED' }));
      repository.findById.mockResolvedValueOnce(application({ status: 'PENDING' }));

      await expect(service.isApproved('seller-1')).resolves.toBe(true);
      await expect(service.isApproved('seller-1')).resolves.toBe(false);

      expect(repository.findById).toHaveBeenCalledTimes(2);
    });

    it('denies an unknown store', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.isApproved('seller-1')).resolves.toBe(false);
    });
  });

  describe('approve', () => {
    it('decides, grants the role and records the event in one transaction', async () => {
      repository.decide.mockImplementation(() => {
        calls.push('decide');
        return Promise.resolve(application({ status: 'APPROVED' }));
      });
      users.grantRole.mockImplementation(() => {
        calls.push('grantRole');
        return Promise.resolve();
      });
      outbox.add.mockImplementation(() => {
        calls.push('outbox');
        return Promise.resolve([]);
      });

      const approved = await service.approve('admin-1', 'seller-1');

      expect(approved.status).toBe('APPROVED');
      expect(calls).toEqual(['begin', 'decide', 'grantRole', 'outbox', 'commit']);
      expect(repository.decide).toHaveBeenCalledWith('seller-1', 'admin-1', { status: 'APPROVED' });
      expect(users.grantRole).toHaveBeenCalledWith('user-1', 'SELLER');
      expect(outbox.add).toHaveBeenCalledWith([
        expect.objectContaining({
          type: EVENT_TYPE.SELLER_APPROVED,
          aggregateId: 'seller-1',
          actorId: 'admin-1',
          payload: { sellerId: 'seller-1', userId: 'user-1' },
        }),
      ]);
    });

    it('logs the moderation only after the transaction committed', async () => {
      repository.decide.mockResolvedValue(application({ status: 'APPROVED' }));
      log.mockImplementation(() => calls.push('log'));

      await service.approve('admin-1', 'seller-1');

      expect(log).toHaveBeenCalledWith({
        msg: 'moderation.seller.approved',
        adminId: 'admin-1',
        sellerId: 'seller-1',
      });
      expect(calls.at(-1)).toBe('log');
    });

    it('does not log or record anything when the role cannot be granted', async () => {
      repository.decide.mockResolvedValue(application({ status: 'APPROVED' }));
      users.grantRole.mockRejectedValue(new Error('db down'));

      await expect(service.approve('admin-1', 'seller-1')).rejects.toThrow('db down');

      expect(outbox.add).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('reports an application that was already decided', async () => {
      repository.decide.mockResolvedValue(null);
      repository.findById.mockResolvedValue(application({ status: 'REJECTED' }));

      await expect(service.approve('admin-1', 'seller-1')).rejects.toBeInstanceOf(
        SellerApplicationNotPendingError,
      );
      expect(users.grantRole).not.toHaveBeenCalled();
      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('reports an unknown application', async () => {
      repository.decide.mockResolvedValue(null);
      repository.findById.mockResolvedValue(null);

      await expect(service.approve('admin-1', 'seller-1')).rejects.toBeInstanceOf(
        SellerApplicationNotFoundError,
      );
    });
  });

  describe('reject', () => {
    it('stores the reason, records the event and logs the decision', async () => {
      repository.decide.mockResolvedValue(
        application({ status: 'REJECTED', rejectionReason: 'Incomplete' }),
      );

      await service.reject('admin-1', 'seller-1', 'Incomplete');

      expect(repository.decide).toHaveBeenCalledWith('seller-1', 'admin-1', {
        status: 'REJECTED',
        reason: 'Incomplete',
      });
      expect(users.grantRole).not.toHaveBeenCalled();
      expect(outbox.add).toHaveBeenCalledWith([
        expect.objectContaining({
          type: EVENT_TYPE.SELLER_REJECTED,
          actorId: 'admin-1',
          payload: { sellerId: 'seller-1', userId: 'user-1', reason: 'Incomplete' },
        }),
      ]);
      expect(log).toHaveBeenCalledWith({
        msg: 'moderation.seller.rejected',
        adminId: 'admin-1',
        sellerId: 'seller-1',
        reason: 'Incomplete',
      });
    });

    it('reports an application that was already decided', async () => {
      repository.decide.mockResolvedValue(null);
      repository.findById.mockResolvedValue(application({ status: 'APPROVED' }));

      await expect(service.reject('admin-1', 'seller-1', 'No')).rejects.toBeInstanceOf(
        SellerApplicationNotPendingError,
      );
    });
  });
});
