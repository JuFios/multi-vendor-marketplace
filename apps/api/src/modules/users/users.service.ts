import { Injectable } from '@nestjs/common';

import { normalizeEmail } from './email';
import type { NewUser, ProfileChanges, UserAccount, UserCredentials } from './user-account';
import type { UserRole } from './user-role';
import { EmailAlreadyRegisteredError, UserNotFoundError } from './users.errors';
import { isEmailTaken, UsersRepository } from './users.repository';

const toAccount = ({ passwordHash: _passwordHash, ...account }: UserCredentials): UserAccount =>
  account;

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async create(user: NewUser): Promise<UserAccount> {
    try {
      return toAccount(await this.users.create({ ...user, email: normalizeEmail(user.email) }));
    } catch (error) {
      if (isEmailTaken(error)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<UserAccount | null> {
    const user = await this.users.findById(id);
    return user && toAccount(user);
  }

  /** Display names by user id; unknown ids are left out. */
  findNames(ids: readonly string[]): Promise<Map<string, string>> {
    return this.users.findNames(ids);
  }

  async getById(id: string): Promise<UserAccount> {
    const user = await this.findById(id);
    if (!user) {
      throw new UserNotFoundError();
    }
    return user;
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    return user && toAccount(user);
  }

  /** Includes the password hash; for credential checks only. */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.users.findByEmail(normalizeEmail(email));
  }

  async updateProfile(id: string, changes: ProfileChanges): Promise<UserAccount> {
    const user = await this.users.updateProfile(id, changes);
    if (!user) {
      throw new UserNotFoundError();
    }
    return toAccount(user);
  }

  markEmailVerified(id: string): Promise<void> {
    return this.users.markEmailVerified(id);
  }

  /** Email and password stops working for the user until a new password is set. */
  clearPassword(id: string): Promise<void> {
    return this.users.clearPassword(id);
  }

  /** Idempotent. Takes effect in new access tokens, so the user must refresh. */
  grantRole(id: string, role: UserRole): Promise<void> {
    return this.users.addRole(id, role);
  }
}
