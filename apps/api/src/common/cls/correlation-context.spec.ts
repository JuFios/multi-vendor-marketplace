import { ClsServiceManager } from 'nestjs-cls';

import { getContextUserId, getCorrelationId } from './correlation-context';

import './cls-store';

describe('correlation context', () => {
  it('is empty outside any context', () => {
    expect(getCorrelationId()).toBeUndefined();
    expect(getContextUserId()).toBeUndefined();
  });

  it('reads the ids stored for the current context', () => {
    const cls = ClsServiceManager.getClsService();

    cls.run(() => {
      cls.set('correlationId', 'abc-1');
      cls.set('userId', 'user-1');

      expect(getCorrelationId()).toBe('abc-1');
      expect(getContextUserId()).toBe('user-1');
    });
  });
});
