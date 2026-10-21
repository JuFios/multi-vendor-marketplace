import { api, unwrap } from '../../lib/api/api';
import type { components } from '../../lib/api/schema';

export type ProductDetails = components['schemas']['ProductDetailsResponseDto'];
export type AuctionState = components['schemas']['AuctionDto'];
export type Bid = components['schemas']['BidDto'];

export function fetchProduct(id: string) {
  return unwrap(api.GET('/api/products/{id}', { params: { path: { id } } }));
}

export function fetchSimilar(id: string) {
  return unwrap(api.GET('/api/products/{id}/similar', { params: { path: { id } } }));
}

export function fetchReviews(id: string, page: number) {
  return unwrap(
    api.GET('/api/products/{id}/reviews', { params: { path: { id }, query: { page, limit: 5 } } }),
  );
}

export function fetchAuction(id: string) {
  return unwrap(api.GET('/api/auctions/{id}', { params: { path: { id } } }));
}

export function fetchBids(id: string) {
  return unwrap(api.GET('/api/auctions/{id}/bids', { params: { path: { id } } }));
}

export function placeBid(input: { auctionId: string; amountCents: number; key: string }) {
  return unwrap(
    api.POST('/api/auctions/{id}/bids', {
      params: { path: { id: input.auctionId }, header: { 'Idempotency-Key': input.key } },
      body: { amountCents: input.amountCents },
    }),
  );
}

export function addToCart(input: { productId: string; quantity: number }) {
  return unwrap(api.POST('/api/cart/items', { body: input }));
}
