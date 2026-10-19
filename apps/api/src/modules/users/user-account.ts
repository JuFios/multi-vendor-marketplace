import type { UserRole } from './user-role';

export const USER_NAME_MAX_LENGTH = 100;

export interface UserAccount {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly UserRole[];
  readonly emailVerified: boolean;
  readonly createdAt: Date;
}

/** `passwordHash` is null for accounts created through an identity provider only. */
export interface UserCredentials extends UserAccount {
  readonly passwordHash: string | null;
}

export interface NewUser {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string | null;
  readonly emailVerified?: boolean;
}

export interface ProfileChanges {
  readonly name: string;
}
