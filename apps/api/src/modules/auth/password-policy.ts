export const PASSWORD_MIN_LENGTH = 8;
// Argon2 accepts long inputs, but an unbounded password is a cheap way to burn CPU and memory.
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordViolation = 'TOO_SHORT' | 'TOO_LONG' | 'NO_LETTER' | 'NO_DIGIT';

/** At least 8 characters with a letter and a digit; empty result means the password is acceptable. */
export function checkPasswordPolicy(password: string): PasswordViolation[] {
  const violations: PasswordViolation[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    violations.push('TOO_SHORT');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    violations.push('TOO_LONG');
  }
  if (!/\p{L}/u.test(password)) {
    violations.push('NO_LETTER');
  }
  if (!/\p{Nd}/u.test(password)) {
    violations.push('NO_DIGIT');
  }
  return violations;
}
