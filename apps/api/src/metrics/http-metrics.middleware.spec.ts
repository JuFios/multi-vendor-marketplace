import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';

import { createHttpMetricsMiddleware } from './http-metrics.middleware';
import type { HttpMetricsService } from './http-metrics.service';

function fakeResponse(overrides: { statusCode: number; writableFinished: boolean }): Response {
  return Object.assign(new EventEmitter(), overrides) as unknown as Response;
}

describe('createHttpMetricsMiddleware', () => {
  const request = {
    method: 'POST',
    route: { path: '/api/orders/:id' },
  } as unknown as Request;
  let record: jest.Mock;
  let middleware: ReturnType<typeof createHttpMetricsMiddleware>;

  beforeEach(() => {
    record = jest.fn();
    middleware = createHttpMetricsMiddleware({ record } as unknown as HttpMetricsService);
  });

  it('records the route template and status once the response is complete', () => {
    const response = fakeResponse({ statusCode: 201, writableFinished: true });
    const next = jest.fn();

    middleware(request, response, next);
    expect(record).not.toHaveBeenCalled();
    response.emit('close');

    expect(next).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      method: 'POST',
      route: '/api/orders/:id',
      status: 201,
      durationSeconds: expect.any(Number) as number,
    });
  });

  it('ignores a connection that closed before the response finished', () => {
    const response = fakeResponse({ statusCode: 200, writableFinished: false });

    middleware(request, response, jest.fn());
    response.emit('close');

    expect(record).not.toHaveBeenCalled();
  });
});
