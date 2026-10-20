import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma, type User } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { NewUser, ProfileChanges, UserCredentials } from './user-account';
import type { UserRole } from './user-role';

const UNIQUE_VIOLATION = 'P2002';

export const isEmailTaken = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;

const toCredentials = (row: User): UserCredentials => ({
  id: row.id,
  email: row.email,
  name: row.name,
  roles: row.roles,
  emailVerified: row.emailVerified,
  createdAt: row.createdAt,
  passwordHash: row.passwordHash,
});

@Injectable()
export class UsersRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  async create(user: NewUser): Promise<UserCredentials> {
    const row = await this.txHost.tx.user.create({
      data: {
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        emailVerified: user.emailVerified ?? false,
      },
    });
    return toCredentials(row);
  }

  async findById(id: string): Promise<UserCredentials | null> {
    const row = await this.txHost.tx.user.findUnique({ where: { id } });
    return row && toCredentials(row);
  }

  async findByEmail(email: string): Promise<UserCredentials | null> {
    const row = await this.txHost.tx.user.findUnique({ where: { email } });
    return row && toCredentials(row);
  }

  /** Returns null when the user does not exist. */
  async updateProfile(id: string, changes: ProfileChanges): Promise<UserCredentials | null> {
    const { count } = await this.txHost.tx.user.updateMany({
      where: { id },
      data: { name: changes.name },
    });
    return count === 0 ? null : this.findById(id);
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.txHost.tx.user.updateMany({ where: { id }, data: { emailVerified: true } });
  }

  /** Appends the role unless the user already holds it. */
  async addRole(id: string, role: UserRole): Promise<void> {
    await this.txHost.tx.user.updateMany({
      where: { id, NOT: { roles: { has: role } } },
      data: { roles: { push: role } },
    });
  }
}
