import type { ArgumentsHost } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { ClsServiceManager } from 'nestjs-cls';
import type { PinoLogger } from 'nestjs-pino';

import { AppError } from '../exceptions/app-error';

import { AllExceptionsFilter } from './all-exceptions.filter';

function setup(
  overrides: { headersSent?: boolean; type?: string; headers?: Record<string, unknown> } = {},
) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const response = {
    headersSent: overrides.headersSent ?? false,
    status,
    setHeader,
    getHeaders: () => overrides.headers ?? {},
  };
  const host = {
    getType: () => overrides.type ?? 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const metrics = { inc: jest.fn() };
  const logger = { error: jest.fn(), setContext: jest.fn() };
  const filter = new AllExceptionsFilter(
    metrics as unknown as Counter<'code'>,
    logger as unknown as PinoLogger,
  );
  return { filter, host, json, status, metrics, logger, setHeader };
}

describe('AllExceptionsFilter', () => {
  it('writes the uniform error body with the correlation id', () => {
    const { filter, host, json, status, metrics, logger } = setup();
    const cls = ClsServiceManager.getClsService();

    cls.run(() => {
      cls.set('correlationId', 'req-1');
      filter.catch(new AppError('PRODUCT_NOT_FOUND', 404, 'No such product', { id: 7 }), host);
    });

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'No such product',
        details: { id: 7 },
        correlationId: 'req-1',
      },
    });
    expect(metrics.inc).toHaveBeenCalledWith({ code: 'PRODUCT_NOT_FOUND' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs the error with its stack for 5xx and returns no internals', () => {
    const { filter, host, json, status, metrics, logger } = setup();
    const failure = new Error('connection string postgres://user:pw@db');

    filter.catch(failure, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, code: 'INTERNAL_ERROR' }),
    );
    expect(metrics.inc).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR' });
  });

  describe('rate limiting', () => {
    const limited = () => new AppError('RATE_LIMITED', 429, 'Too many requests');

    it('adds the standard Retry-After, taking the longest of the named throttlers', () => {
      const { filter, host, setHeader } = setup({
        headers: { 'retry-after-login': '12', 'retry-after-loginemail': '45', 'x-other': '1' },
      });

      filter.catch(limited(), host);

      expect(setHeader).toHaveBeenCalledWith('Retry-After', 45);
    });

    it('adds nothing when no throttler reported a delay', () => {
      const { filter, host, setHeader } = setup();

      filter.catch(limited(), host);

      expect(setHeader).not.toHaveBeenCalled();
    });

    it('leaves other statuses alone', () => {
      const { filter, host, setHeader } = setup({ headers: { 'retry-after-login': '12' } });

      filter.catch(new AppError('PRODUCT_NOT_FOUND', 404, 'No such product'), host);

      expect(setHeader).not.toHaveBeenCalled();
    });
  });

  it('does not write when the response has already started', () => {
    const { filter, host, status } = setup({ headersSent: true });

    filter.catch(new Error('late'), host);

    expect(status).not.toHaveBeenCalled();
  });

  it('leaves non-http contexts to other handlers', () => {
    const { filter, host } = setup({ type: 'ws' });
    const failure = new Error('ws failure');

    expect(() => filter.catch(failure, host)).toThrow(failure);
  });
});
