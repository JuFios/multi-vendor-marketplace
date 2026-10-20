import type { IncomingMessage, ServerResponse } from 'node:http';

import type { LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';

import {
  getContextEventId,
  getContextUserId,
  getCorrelationId,
} from '../common/cls/correlation-context';
import { resolveRouteTemplate } from '../common/utils/route-template';

import { REDACT_CENSOR, REDACT_PATHS } from './logger.constants';

export interface LoggerOptionsInput {
  readonly level: LevelWithSilent;
  readonly prettyPrint: boolean;
}

function requestFields(
  req: IncomingMessage,
  res: ServerResponse,
  durationMs: number,
): Record<string, unknown> {
  return {
    method: req.method,
    route: resolveRouteTemplate(req),
    statusCode: res.statusCode,
    durationMs,
  };
}

function levelForStatus(statusCode: number): LevelWithSilent {
  if (statusCode >= 500) {
    return 'error';
  }
  return statusCode >= 400 ? 'warn' : 'info';
}

/**
 * Request lines carry the route template, status and duration instead of the raw request, and
 * bodies are never logged. correlationId and userId come from the CLS context on every line, so
 * one chain of logs shares one id.
 */
export function buildPinoHttpOptions({
  level,
  prettyPrint,
}: LoggerOptionsInput): Options<IncomingMessage, ServerResponse> {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    mixin: () => {
      const correlationId = getCorrelationId();
      const userId = getContextUserId();
      const eventId = getContextEventId();
      return {
        ...(correlationId === undefined ? {} : { correlationId }),
        ...(userId === undefined ? {} : { userId }),
        ...(eventId === undefined ? {} : { eventId }),
      };
    },
    serializers: { req: () => undefined, res: () => undefined },
    customLogLevel: (_req, res) => levelForStatus(res.statusCode),
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    customSuccessObject: (req, res, value) =>
      requestFields(req, res, (value as { responseTime: number }).responseTime),
    customErrorObject: (req, res, _error, value) =>
      requestFields(req, res, (value as { responseTime: number }).responseTime),
    ...(prettyPrint ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  };
}
