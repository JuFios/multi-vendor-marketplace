import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { getCorrelationId } from '../../common/correlation';
import { MetricsService } from '../metrics';

import { mapException } from './map-exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    // The class token needs no registration-order luck, unlike @InjectPinoLogger.
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const response = host.switchToHttp().getResponse<Response>();
    const { status, code, message, details } = mapException(exception);

    this.metrics.recordError(code);
    if (status >= 500) {
      this.logger.error({ err: exception, code, msg: 'request.failed' });
    }
    if (response.headersSent) {
      return;
    }

    const correlationId = getCorrelationId();
    response.status(status).json({
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        ...(correlationId === undefined ? {} : { correlationId }),
      },
    });
  }
}
