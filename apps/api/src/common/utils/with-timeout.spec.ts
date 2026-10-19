import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the result of a fast operation', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'op')).resolves.toBe('done');
  });

  it('rejects with the original error of a failing operation', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'op')).rejects.toThrow(
      'boom',
    );
  });

  it('rejects with a TimeoutError when the operation is too slow', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 50, 'slow op');
    const assertion = expect(pending).rejects.toThrow(TimeoutError);

    await jest.advanceTimersByTimeAsync(50);

    await assertion;
  });
});
