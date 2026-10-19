import { argon2id, hash } from 'argon2';

import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an argon2id hash that verifies only the original password', async () => {
    const stored = await hasher.hash('correct-horse-1');

    expect(stored).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(stored, 'correct-horse-1')).toBe(true);
    expect(await hasher.verify(stored, 'correct-horse-2')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same-password-1')).not.toBe(await hasher.hash('same-password-1'));
  });

  it('verifies a hash created the way the database seed creates it', async () => {
    const seeded = await hash('demo-password-1', { type: argon2id });

    expect(await hasher.verify(seeded, 'demo-password-1')).toBe(true);
  });

  it('rejects every password when there is no stored hash', async () => {
    expect(await hasher.verify(null, 'anything-1')).toBe(false);
  });
});
