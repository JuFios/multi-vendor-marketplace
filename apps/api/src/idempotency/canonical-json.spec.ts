import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('does not depend on key order, at any depth', () => {
    const a = { b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } };
    const b = { a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('keeps array order, which is significant', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('ignores undefined properties and tolerates a missing body', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson(undefined)).toBe('null');
  });
});
