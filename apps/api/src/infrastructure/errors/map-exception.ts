import { HttpException } from '@nestjs/common';

import { AppError, DependencyUnavailableError, ERROR_CODE } from '../../common/errors';
import { Prisma } from '../../generated/prisma/client';

export interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const INTERNAL_MESSAGE = 'Internal server error';

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: ERROR_CODE.BAD_REQUEST,
  401: ERROR_CODE.UNAUTHORIZED,
  403: ERROR_CODE.FORBIDDEN,
  404: ERROR_CODE.NOT_FOUND,
  405: ERROR_CODE.METHOD_NOT_ALLOWED,
  409: ERROR_CODE.CONFLICT,
  413: ERROR_CODE.PAYLOAD_TOO_LARGE,
  415: ERROR_CODE.UNSUPPORTED_MEDIA_TYPE,
  429: ERROR_CODE.RATE_LIMITED,
  503: ERROR_CODE.DEPENDENCY_UNAVAILABLE,
};

/** Prisma: unreachable server, pool exhausted/timeout, closed connection. */
const PRISMA_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

const UNAVAILABLE_ERROR_NAMES = new Set([
  'MaxRetriesPerRequestError',
  'ClusterAllFailedError',
  'AbortError',
  'TimeoutError',
  'MeilisearchRequestError',
  'MeilisearchRequestTimeOutError',
]);

const UNAVAILABLE_SYSTEM_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);

function isDependencyUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const { code } = error as { code?: unknown };
  return (
    UNAVAILABLE_ERROR_NAMES.has(error.name) ||
    (typeof code === 'string' && UNAVAILABLE_SYSTEM_CODES.has(code))
  );
}

function mapPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): MappedError {
  if (error.code === 'P2002') {
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    return {
      status: 409,
      code: ERROR_CODE.CONFLICT,
      message: 'Resource already exists',
      ...(Array.isArray(target) ? { details: { fields: target } } : {}),
    };
  }
  if (error.code === 'P2025') {
    return { status: 404, code: ERROR_CODE.NOT_FOUND, message: 'Resource not found' };
  }
  if (PRISMA_UNAVAILABLE_CODES.has(error.code)) {
    return unavailable();
  }
  return internal();
}

function mapHttpException(exception: HttpException): MappedError {
  const status = exception.getStatus();
  const body = exception.getResponse();
  const code =
    CODE_BY_STATUS[status] ?? (status >= 500 ? ERROR_CODE.INTERNAL_ERROR : ERROR_CODE.BAD_REQUEST);
  if (typeof body === 'string') {
    return { status, code, message: body };
  }
  const { message, error } = body as { message?: unknown; error?: unknown };
  if (Array.isArray(message)) {
    return { status, code, message: exception.message, details: message };
  }
  const text =
    typeof message === 'string' ? message : typeof error === 'string' ? error : exception.message;
  // Terminus-style bodies describe per-dependency state; they are safe and useful to keep.
  return { status, code, message: text, ...(status === 503 ? { details: body } : {}) };
}

/** http-errors shape thrown by Express body parsing (malformed JSON, oversized body). */
function clientStatusOf(error: unknown): number | undefined {
  const { status, statusCode } = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && value >= 400 && value < 500 ? value : undefined;
}

function unavailable(): MappedError {
  const error = new DependencyUnavailableError();
  return { status: error.httpStatus, code: error.code, message: error.message };
}

function internal(): MappedError {
  return { status: 500, code: ERROR_CODE.INTERNAL_ERROR, message: INTERNAL_MESSAGE };
}

/** Turns anything thrown during a request into the API error shape, never leaking internals. */
export function mapException(exception: unknown): MappedError {
  if (exception instanceof AppError) {
    return {
      status: exception.httpStatus,
      code: exception.code,
      message: exception.message,
      ...(exception.details === undefined ? {} : { details: exception.details }),
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownError(exception);
  }
  if (
    exception instanceof Prisma.PrismaClientInitializationError ||
    isDependencyUnavailable(exception)
  ) {
    return unavailable();
  }
  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }
  const status = clientStatusOf(exception);
  if (status !== undefined) {
    return {
      status,
      code: CODE_BY_STATUS[status] ?? ERROR_CODE.BAD_REQUEST,
      message: status === 413 ? 'Request body too large' : 'Malformed request',
    };
  }
  return internal();
}
