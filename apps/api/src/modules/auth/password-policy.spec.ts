import { checkPasswordPolicy, PASSWORD_MAX_LENGTH } from './password-policy';

describe('checkPasswordPolicy', () => {
  it('accepts a password with letters and digits of at least 8 characters', () => {
    expect(checkPasswordPolicy('abcdefg1')).toEqual([]);
    expect(checkPasswordPolicy('Пароль-2026')).toEqual([]);
  });

  it('rejects a short password', () => {
    expect(checkPasswordPolicy('abc123')).toEqual(['TOO_SHORT']);
  });

  it('requires a letter and a digit', () => {
    expect(checkPasswordPolicy('12345678')).toEqual(['NO_LETTER']);
    expect(checkPasswordPolicy('abcdefgh')).toEqual(['NO_DIGIT']);
  });

  it('reports every violation at once', () => {
    expect(checkPasswordPolicy('')).toEqual(['TOO_SHORT', 'NO_LETTER', 'NO_DIGIT']);
  });

  it('caps the length', () => {
    expect(checkPasswordPolicy(`a1${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toEqual(['TOO_LONG']);
    expect(checkPasswordPolicy(`a1${'x'.repeat(PASSWORD_MAX_LENGTH - 2)}`)).toEqual([]);
  });
});
