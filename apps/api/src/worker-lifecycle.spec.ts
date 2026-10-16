import { Logger } from '@nestjs/common';

import { WorkerLifecycle } from './worker-lifecycle';

describe('WorkerLifecycle', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts and stops the keep-alive timer', () => {
    jest.useFakeTimers();
    const lifecycle = new WorkerLifecycle();

    lifecycle.onApplicationBootstrap();
    expect(jest.getTimerCount()).toBe(1);

    lifecycle.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
