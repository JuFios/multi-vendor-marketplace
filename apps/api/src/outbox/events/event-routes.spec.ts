import { QUEUE_NAMES } from '../../queue/queue-names';

import { EVENT_ROUTES } from './event-routes';
import { EVENT_TYPES } from './event-types';

describe('EVENT_ROUTES', () => {
  it('has an entry for every event type and none for unknown ones', () => {
    expect(Object.keys(EVENT_ROUTES).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it.each(EVENT_TYPES)('%s routes to an array of known queues', (type) => {
    const routes = EVENT_ROUTES[type];

    expect(Array.isArray(routes)).toBe(true);
    for (const queue of routes) {
      expect(QUEUE_NAMES).toContain(queue);
    }
  });

  it('lists each queue at most once per event type', () => {
    for (const type of EVENT_TYPES) {
      expect(new Set(EVENT_ROUTES[type]).size).toBe(EVENT_ROUTES[type].length);
    }
  });
});
