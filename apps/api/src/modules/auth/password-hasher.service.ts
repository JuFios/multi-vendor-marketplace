import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

// Same call as the database seed, so seeded demo accounts verify with the parameters they were hashed with.
const hashPassword = (plain: string): Promise<string> => hash(plain, { type: argon2id });

@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  /**
   * A missing hash (unknown email, or an account that only signs in through a provider) is checked
   * against a throwaway one, so the response time does not reveal whether the account exists.
   */
  async verify(storedHash: string | null, plain: string): Promise<boolean> {
    if (storedHash === null) {
      this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
      await verify(await this.dummyHash, plain);
      return false;
    }
    return verify(storedHash, plain);
  }
}
