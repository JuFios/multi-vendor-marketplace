import { changedFields, isPublished } from './product';

const live = { archivedAt: null };

describe('isPublished', () => {
  it.each([
    ['PENDING', false, true],
    ['PENDING', true, false],
    ['APPROVED', false, true],
    ['APPROVED', true, true],
    ['REJECTED', false, false],
    ['REJECTED', true, false],
  ] as const)('%s with pre-moderation %s is published: %s', (status, premoderation, expected) => {
    expect(isPublished({ ...live, moderationStatus: status }, premoderation)).toBe(expected);
  });

  it.each([false, true])('never publishes an archived product (pre-moderation %s)', (flag) => {
    expect(isPublished({ archivedAt: new Date(), moderationStatus: 'APPROVED' }, flag)).toBe(false);
  });
});

describe('changedFields', () => {
  const current = {
    categoryId: 'c1',
    title: 'Phone',
    description: 'Good phone',
    images: ['https://img.example/1.png'],
    priceCents: 1000,
  };

  it('lists only the fields whose value differs', () => {
    expect(changedFields(current, { title: 'Phone', priceCents: 1200 })).toEqual(['priceCents']);
  });

  it('compares image lists by content', () => {
    expect(changedFields(current, { images: ['https://img.example/1.png'] })).toEqual([]);
    expect(changedFields(current, { images: [] })).toEqual(['images']);
  });

  it('reports nothing when no field is provided', () => {
    expect(changedFields(current, {})).toEqual([]);
  });
});
