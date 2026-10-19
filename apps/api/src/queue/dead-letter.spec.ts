import { UnrecoverableError } from 'bullmq';

import { isDeadLetter } from './dead-letter';

describe('isDeadLetter', () => {
  const error = new Error('boom');

  it('is false while retries remain', () => {
    expect(isDeadLetter({ attemptsMade: 2, opts: { attempts: 5 } }, error)).toBe(false);
  });

  it('is true when the last attempt failed', () => {
    expect(isDeadLetter({ attemptsMade: 5, opts: { attempts: 5 } }, error)).toBe(true);
  });

  it('treats a job without an attempts limit as single-shot', () => {
    expect(isDeadLetter({ attemptsMade: 1, opts: {} }, error)).toBe(true);
  });

  it('is true for an unrecoverable error even with retries left', () => {
    expect(
      isDeadLetter({ attemptsMade: 1, opts: { attempts: 5 } }, new UnrecoverableError('bad data')),
    ).toBe(true);
  });
});
