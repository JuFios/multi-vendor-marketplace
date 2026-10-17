import type { ArgumentsHost } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import type { PinoLogger } from 'nestjs-pino';

import { AppError } from '../../common/errors';
import '../../common/correlation';
import type { MetricsService } from '../metrics';

import { AllExceptionsFilter } from './all-exceptions.filter';

function setup(overrides: { headersSent?: boolean; type?: string } = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { headersSent: overrides.headersSent ?? false, status };
  const host = {
    getType: () => overrides.type ?? 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const metrics = { recordError: jest.fn() };
  const logger = { error: jest.fn(), setContext: jest.fn() };
  const filter = new AllExceptionsFilter(
    metrics as unknown as MetricsService,
    logger as unknown as PinoLogger,
  );
  return { filter, host, json, status, metrics, logger };
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
    expect(metrics.recordError).toHaveBeenCalledWith('PRODUCT_NOT_FOUND');
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
    expect(metrics.recordError).toHaveBeenCalledWith('INTERNAL_ERROR');
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
