import { isValidCorrelationId, resolveCorrelationId } from './correlation-id';

describe('correlation id', () => {
  it('keeps a well-formed client id', () => {
    expect(resolveCorrelationId('test-123')).toBe('test-123');
  });

  it.each([
    ['too long', 'a'.repeat(65)],
    ['unsafe characters', 'abc\r\nSet-Cookie: x=1'],
    ['empty', ''],
    ['repeated header', ['a', 'b']],
    ['missing', undefined],
  ])('generates a new id for %s', (_name, header) => {
    const id = resolveCorrelationId(header);

    expect(isValidCorrelationId(id)).toBe(true);
    expect(id).not.toBe(header);
  });

  it('generates a different id each time', () => {
    expect(resolveCorrelationId(undefined)).not.toBe(resolveCorrelationId(undefined));
  });

  it('accepts exactly 64 characters', () => {
    expect(isValidCorrelationId('a'.repeat(64))).toBe(true);
  });
});
