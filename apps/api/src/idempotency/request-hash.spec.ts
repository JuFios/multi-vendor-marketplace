import { computeRequestHash, type HashedRequest } from './request-hash';

const request: HashedRequest = {
  method: 'POST',
  route: '/api/orders/:id/refunds',
  params: { id: '1' },
  body: { items: [{ id: 'a', quantity: 1 }], reason: 'damaged' },
};

describe('computeRequestHash', () => {
  it('is stable regardless of the order of JSON keys', () => {
    const reordered: HashedRequest = {
      ...request,
      params: { id: '1' },
      body: { reason: 'damaged', items: [{ quantity: 1, id: 'a' }] },
    };

    expect(computeRequestHash(reordered)).toBe(computeRequestHash(request));
  });

  it('is a sha256 hex digest', () => {
    expect(computeRequestHash(request)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each<[string, Partial<HashedRequest>]>([
    ['body', { body: { reason: 'late' } }],
    ['params', { params: { id: '2' } }],
    ['route', { route: '/api/orders/:id/cancel' }],
    ['method', { method: 'PUT' }],
  ])('changes with the %s', (_name, change) => {
    expect(computeRequestHash({ ...request, ...change })).not.toBe(computeRequestHash(request));
  });

  it('treats the method case-insensitively', () => {
    expect(computeRequestHash({ ...request, method: 'post' })).toBe(computeRequestHash(request));
  });
});
