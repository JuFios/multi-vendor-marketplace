import type { IncomingMessage } from 'node:http';

export const UNMATCHED_ROUTE = 'unmatched';

interface RoutedRequest extends IncomingMessage {
  route?: { path?: unknown };
}

/**
 * Express route pattern (`/api/orders/:id`), never the raw URL, so it is safe as a log field or
 * metric label. A wildcard is the catch-all of the middleware chain, i.e. no controller matched.
 */
export function resolveRouteTemplate(req: IncomingMessage): string {
  const path = (req as RoutedRequest).route?.path;
  return typeof path === 'string' && !path.includes('*') ? path : UNMATCHED_ROUTE;
}
