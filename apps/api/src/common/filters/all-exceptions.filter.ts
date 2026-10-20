import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { APP_ERRORS_TOTAL } from '../../metrics/metrics.constants';
import { getCorrelationId } from '../cls/correlation-context';

import { mapException } from './map-exception';

const THROTTLER_RETRY_AFTER_PREFIX = 'retry-after-';

/**
 * Named throttlers report `Retry-After-<name>`; clients and proxies only understand the plain
 * header, so a rate-limited response carries the longest of them under that name.
 */
function retryAfterSeconds(response: Response): number | undefined {
  let longest: number | undefined;
  for (const [name, value] of Object.entries(response.getHeaders())) {
    if (!name.startsWith(THROTTLER_RETRY_AFTER_PREFIX)) {
      continue;
    }
    const seconds = Number(Array.isArray(value) ? value[0] : value);
    if (Number.isFinite(seconds)) {
      longest = Math.max(longest ?? 0, Math.ceil(seconds));
    }
  }
  return longest;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectMetric(APP_ERRORS_TOTAL) private readonly errors: Counter<'code'>,
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

    this.errors.inc({ code });
    if (status >= 500) {
      this.logger.error({ err: exception, code, msg: 'request.failed' });
    }
    if (response.headersSent) {
      return;
    }

    if (status === 429) {
      const retryAfter = retryAfterSeconds(response);
      if (retryAfter !== undefined) {
        response.setHeader('Retry-After', retryAfter);
      }
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
