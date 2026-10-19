import type { Request, Response } from 'express';
import { ClsServiceManager, type ClsService } from 'nestjs-cls';

import {
  CORRELATION_ID_REQUEST_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
  resolveCorrelationId,
} from './correlation-id';

import './cls-store';

/** Correlation id of the current request, job or event; undefined outside any context. */
export function getCorrelationId(): string | undefined {
  return ClsServiceManager.getClsService().get('correlationId');
}

/** Id of the authenticated user in the current context, if known. */
export function getContextUserId(): string | undefined {
  return ClsServiceManager.getClsService().get('userId');
}

/** Records the authenticated user for the rest of the request; a no-op outside a context. */
export function setContextUserId(userId: string): void {
  const cls = ClsServiceManager.getClsService();
  if (cls.isActive()) {
    cls.set('userId', userId);
  }
}

/** CLS `setup` hook for HTTP requests: stores the id and echoes it in the response. */
export function bindRequestCorrelationId(cls: ClsService, req: Request, res: Response): void {
  const correlationId = resolveCorrelationId(req.headers[CORRELATION_ID_REQUEST_HEADER]);
  cls.set('correlationId', correlationId);
  res.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
}
