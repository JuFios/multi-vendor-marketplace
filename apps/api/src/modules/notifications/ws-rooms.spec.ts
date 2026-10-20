import { exceedsLimit, parseSubscribeRequest, roomOf } from './ws-rooms';

const ID = '0b9f7c3e-52a1-4f2e-9d44-0a1b2c3d4e5f';

describe('parseSubscribeRequest', () => {
  it('accepts a public channel with a uuid', () => {
    expect(parseSubscribeRequest({ channel: 'auction', id: ID })).toEqual({
      channel: 'auction',
      id: ID,
    });
    expect(parseSubscribeRequest({ channel: 'product', id: ID.toUpperCase() })).toEqual({
      channel: 'product',
      id: ID,
    });
  });

  it.each([
    null,
    'auction',
    {},
    { channel: 'user', id: ID },
    { channel: 'seller', id: ID },
    { channel: 'auction', id: 'not-a-uuid' },
    { channel: 'auction', id: 42 },
    { channel: ['auction'], id: ID },
  ])('rejects %j', (raw) => {
    expect(parseSubscribeRequest(raw)).toBeNull();
  });
});

describe('exceedsLimit', () => {
  const request = { channel: 'product', id: ID } as const;

  it('refuses a new room once the limit is reached', () => {
    expect(exceedsLimit(new Set(['product:a', 'product:b']), request, 2)).toBe(true);
    expect(exceedsLimit(new Set(['product:a']), request, 2)).toBe(false);
  });

  it('lets a room that is already followed refresh at the limit', () => {
    expect(exceedsLimit(new Set([roomOf(request), 'product:b']), request, 2)).toBe(false);
  });
});
