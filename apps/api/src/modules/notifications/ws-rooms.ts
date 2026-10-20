import { WS_CHANNELS, type SubscribeRequest } from './ws-events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const userRoom = (userId: string): string => `user:${userId}`;
export const sellerRoom = (sellerId: string): string => `seller:${sellerId}`;
export const productRoom = (productId: string): string => `product:${productId}`;
export const auctionRoom = (auctionId: string): string => `auction:${auctionId}`;

export const roomOf = ({ channel, id }: SubscribeRequest): string => `${channel}:${id}`;

/** Accepts only a known public channel and a UUID; anything else is not a subscription. */
export function parseSubscribeRequest(raw: unknown): SubscribeRequest | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { channel, id } = raw as { channel?: unknown; id?: unknown };
  const known = WS_CHANNELS.find((candidate) => candidate === channel);
  if (known === undefined || typeof id !== 'string' || !UUID.test(id)) {
    return null;
  }
  return { channel: known, id: id.toLowerCase() };
}

/** A room already followed does not count again, so a repeated subscribe just refreshes. */
export function exceedsLimit(
  followed: ReadonlySet<string>,
  request: SubscribeRequest,
  max: number,
): boolean {
  return !followed.has(roomOf(request)) && followed.size >= max;
}
