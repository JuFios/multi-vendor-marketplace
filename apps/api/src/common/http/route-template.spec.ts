import type { IncomingMessage } from 'node:http';

import { resolveRouteTemplate, UNMATCHED_ROUTE } from './route-template';

const requestWithRoute = (path: unknown): IncomingMessage =>
  ({ route: path === undefined ? undefined : { path } }) as unknown as IncomingMessage;

describe('resolveRouteTemplate', () => {
  it('returns the matched route pattern', () => {
    expect(resolveRouteTemplate(requestWithRoute('/api/orders/:id'))).toBe('/api/orders/:id');
  });

  it.each([undefined, '*path', '/api/*splat', 42])('treats %s as unmatched', (path) => {
    expect(resolveRouteTemplate(requestWithRoute(path))).toBe(UNMATCHED_ROUTE);
  });
});
