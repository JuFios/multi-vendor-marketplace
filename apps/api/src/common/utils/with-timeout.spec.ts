import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the operation result', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'op')).resolves.toBe(42);
  });

  it('propagates the operation error', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'op')).rejects.toThrow(
      'boom',
    );
  });

  it('rejects with TimeoutError when the operation is too slow', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 500, 'slow op');
    const assertion = expect(pending).rejects.toThrow(new TimeoutError('slow op', 500));

    await jest.advanceTimersByTimeAsync(500);

    await assertion;
  });
});
