import { api, unwrap } from '../../lib/api/api';

export function fetchCart() {
  return unwrap(api.GET('/api/cart'));
}
