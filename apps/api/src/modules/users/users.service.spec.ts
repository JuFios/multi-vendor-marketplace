import { Prisma } from '../../generated/prisma/client';

import type { UserCredentials } from './user-account';
import { EmailAlreadyRegisteredError, UserNotFoundError } from './users.errors';
import type { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const row: UserCredentials = {
  id: '6f1d3c1e-0b0a-4c55-9d0b-0b6f6a1b2c3d',
  email: 'buyer@example.com',
  name: 'Buyer',
  roles: ['CUSTOMER'],
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  passwordHash: '$argon2id$stored',
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });

describe('UsersService', () => {
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    updateProfile: jest.fn(),
    markEmailVerified: jest.fn(),
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(repository as unknown as UsersRepository);
  });

  describe('create', () => {
    it('stores the normalized email and never returns the password hash', async () => {
      repository.create.mockResolvedValue(row);

      const account = await service.create({
        email: ' Buyer@Example.com ',
        name: 'Buyer',
        passwordHash: row.passwordHash,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'buyer@example.com' }),
      );
      expect(account).not.toHaveProperty('passwordHash');
      expect(account.email).toBe('buyer@example.com');
    });

    it('maps a unique violation to EMAIL_ALREADY_REGISTERED', async () => {
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create({ email: 'buyer@example.com', name: 'Buyer', passwordHash: null }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    it('rethrows other failures untouched', async () => {
      const failure = new Error('connection lost');
      repository.create.mockRejectedValue(failure);

      await expect(
        service.create({ email: 'buyer@example.com', name: 'Buyer', passwordHash: null }),
      ).rejects.toBe(failure);
    });
  });

  describe('lookups', () => {
    it('finds by email case-insensitively', async () => {
      repository.findByEmail.mockResolvedValue(row);

      await service.findByEmail('BUYER@example.com');

      expect(repository.findByEmail).toHaveBeenCalledWith('buyer@example.com');
    });

    it('keeps the password hash only in the credentials lookup', async () => {
      repository.findByEmail.mockResolvedValue(row);

      expect(await service.findCredentialsByEmail('buyer@example.com')).toHaveProperty(
        'passwordHash',
        row.passwordHash,
      );
      expect(await service.findByEmail('buyer@example.com')).not.toHaveProperty('passwordHash');
    });

    it('getById throws USER_NOT_FOUND for an unknown id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(row.id)).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('returns the updated account', async () => {
      repository.updateProfile.mockResolvedValue({ ...row, name: 'New Name' });

      const account = await service.updateProfile(row.id, { name: 'New Name' });

      expect(account.name).toBe('New Name');
      expect(account).not.toHaveProperty('passwordHash');
    });

    it('throws USER_NOT_FOUND when the user is gone', async () => {
      repository.updateProfile.mockResolvedValue(null);

      await expect(service.updateProfile(row.id, { name: 'X' })).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });
});
