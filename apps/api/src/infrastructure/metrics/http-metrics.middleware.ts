import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { resolveRouteTemplate } from '../../common/http';

import type { MetricsService } from './metrics.service';

const NANOSECONDS_PER_SECOND = 1e9;

/**
 * Plain Express middleware rather than a Nest interceptor: interceptors never see requests that
 * match no handler (404s) or that fail before one is chosen, and those must be counted too.
 */
export function createHttpMetricsMiddleware(metrics: MetricsService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();

    res.once('close', () => {
      if (!res.writableFinished) {
        return;
      }
      metrics.recordHttpRequest({
        method: req.method,
        route: resolveRouteTemplate(req),
        status: res.statusCode,
        durationSeconds: Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND,
      });
    });
    next();
  };
}
