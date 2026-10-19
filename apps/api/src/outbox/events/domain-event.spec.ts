import { ClsServiceManager } from 'nestjs-cls';

import '../../common/cls/cls-store';

import { createDomainEventDraft } from './domain-event';
import { EVENT_TYPE } from './event-types';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const newEvent = {
  type: EVENT_TYPE.PRODUCT_CREATED,
  aggregateType: 'Product',
  aggregateId: '0197f3a2-0000-7000-8000-000000000001',
  payload: { productId: '0197f3a2-0000-7000-8000-000000000001', version: 1 },
} as const;

describe('createDomainEventDraft', () => {
  it('takes the correlation id and actor from the current CLS context', () => {
    const cls = ClsServiceManager.getClsService();

    const draft = cls.run(() => {
      cls.set('correlationId', 'req-42');
      cls.set('userId', 'user-7');
      return createDomainEventDraft(newEvent);
    });

    expect(draft).toMatchObject({ correlationId: 'req-42', actorId: 'user-7' });
  });

  it('prefers an explicit actor over the context user', () => {
    const cls = ClsServiceManager.getClsService();

    const draft = cls.run(() => {
      cls.set('userId', 'user-7');
      return createDomainEventDraft({ ...newEvent, actorId: null });
    });

    expect(draft.actorId).toBeNull();
  });

  it('leaves both ids null outside any context', () => {
    const draft = createDomainEventDraft(newEvent);

    expect(draft.correlationId).toBeNull();
    expect(draft.actorId).toBeNull();
  });

  it('assigns a distinct, time-ordered UUID v7 to every event', () => {
    const drafts = Array.from({ length: 50 }, () => createDomainEventDraft(newEvent));
    const ids = drafts.map(({ id }) => id);

    for (const id of ids) {
      expect(id).toMatch(UUID_V7);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
