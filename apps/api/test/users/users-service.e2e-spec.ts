import type { NestExpressApplication } from '@nestjs/platform-express';

import {
  EmailAlreadyRegisteredError,
  UserNotFoundError,
  UsersModule,
  UsersService,
} from '../../src/modules/users';
import { PrismaService } from '../../src/prisma';
import { resetDb } from '../utils/db';
import { createTestApp } from '../utils/test-app';

describe('UsersService (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let users: UsersService;

  beforeAll(async () => {
    app = await createTestApp([], { imports: [UsersModule], worker: false });
    prisma = app.get(PrismaService);
    users = app.get(UsersService, { strict: false });
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  it('creates a customer with a lower-cased email and defaults', async () => {
    const account = await users.create({
      email: 'New.Buyer@Example.com',
      name: 'New Buyer',
      passwordHash: 'hash',
    });

    expect(account).toMatchObject({
      email: 'new.buyer@example.com',
      roles: ['CUSTOMER'],
      emailVerified: false,
    });
    expect((await users.findByEmail('NEW.BUYER@example.com'))?.id).toBe(account.id);
  });

  it('rejects a second account with the same email regardless of case', async () => {
    await users.create({ email: 'dup@example.com', name: 'First', passwordHash: null });

    await expect(
      users.create({ email: 'DUP@example.com', name: 'Second', passwordHash: null }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('updates the profile name and marks the email verified', async () => {
    const { id } = await users.create({
      email: 'edit@example.com',
      name: 'Old',
      passwordHash: null,
    });

    expect((await users.updateProfile(id, { name: 'Renamed' })).name).toBe('Renamed');
    await users.markEmailVerified(id);

    expect((await users.getById(id)).emailVerified).toBe(true);
  });

  it('grants a role once, however often it is asked for', async () => {
    const { id } = await users.create({
      email: 'role@example.com',
      name: 'Role',
      passwordHash: null,
    });

    await users.grantRole(id, 'SELLER');
    await users.grantRole(id, 'SELLER');

    expect((await users.getById(id)).roles).toEqual(['CUSTOMER', 'SELLER']);
  });

  it('reports an unknown user as USER_NOT_FOUND', async () => {
    await expect(
      users.updateProfile('00000000-0000-4000-8000-000000000000', { name: 'Nobody' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
