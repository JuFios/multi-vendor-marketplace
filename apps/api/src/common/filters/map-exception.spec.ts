import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { Prisma } from '../../generated/prisma/client';
import {
  AppError,
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  ValidationFailedError,
} from '../exceptions/app-error';

import { mapException } from './map-exception';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom: secret sql', {
    code,
    clientVersion: 'test',
    ...(meta === undefined ? {} : { meta }),
  });

function namedError(name: string, message = 'boom'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('mapException', () => {
  it('renders an AppError as declared', () => {
    expect(
      mapException(new AppError('PRODUCT_NOT_FOUND', 404, 'No such product', { id: 1 })),
    ).toEqual({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'No such product',
      details: { id: 1 },
    });
  });

  it('omits details when an AppError has none', () => {
    expect(mapException(new NotFoundError())).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
    expect(mapException(new ConflictError()).status).toBe(409);
    expect(mapException(new DependencyUnavailableError()).code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('keeps validation details', () => {
    const fields = [{ field: 'email', messages: ['must be an email'] }];

    expect(mapException(new ValidationFailedError(fields))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: fields,
    });
  });

  describe('Prisma', () => {
    it('maps a unique violation (P2002) to 409 CONFLICT with the fields', () => {
      expect(mapException(prismaError('P2002', { target: ['email'] }))).toEqual({
        status: 409,
        code: 'CONFLICT',
        message: 'Resource already exists',
        details: { fields: ['email'] },
      });
    });

    it('maps a unique violation without a field list', () => {
      expect(mapException(prismaError('P2002', { target: 'users_email_key' }))).not.toHaveProperty(
        'details',
      );
    });

    it('maps a missing record (P2025) to 404 NOT_FOUND', () => {
      expect(mapException(prismaError('P2025'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])(
      'maps connectivity error %s to 503',
      (code) => {
        expect(mapException(prismaError(code))).toMatchObject({
          status: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
        });
      },
    );

    it('maps an initialization failure to 503', () => {
      const error = new Prisma.PrismaClientInitializationError('cannot reach db', 'test');

      expect(mapException(error)).toMatchObject({ status: 503, code: 'DEPENDENCY_UNAVAILABLE' });
    });

    it('hides other Prisma errors behind INTERNAL_ERROR', () => {
      const mapped = mapException(prismaError('P2003'));

      expect(mapped).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    });
  });

  describe('dependency failures', () => {
    it.each(['MaxRetriesPerRequestError', 'MeilisearchRequestError', 'TimeoutError'])(
      'maps %s to 503',
      (name) => {
        expect(mapException(namedError(name, 'secret host:6379'))).toEqual({
          status: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'A required dependency is temporarily unavailable',
        });
      },
    );

    it('maps connection errno codes to 503', () => {
      const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), {
        code: 'ECONNREFUSED',
      });

      expect(mapException(error).status).toBe(503);
    });
  });

  describe('HTTP exceptions', () => {
    it('maps throttling to 429 RATE_LIMITED', () => {
      expect(mapException(new ThrottlerException())).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
    });

    it('maps well-known statuses to their codes', () => {
      expect(mapException(new NotFoundException('Cannot GET /x'))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Cannot GET /x',
      });
      expect(mapException(new ForbiddenException()).code).toBe('FORBIDDEN');
    });

    it('moves an array message into details', () => {
      const mapped = mapException(new BadRequestException(['a must be a string']));

      expect(mapped).toMatchObject({
        status: 400,
        code: 'BAD_REQUEST',
        details: ['a must be a string'],
      });
    });

    it('keeps the per-dependency body of a 503', () => {
      const body = { status: 'error', error: { redis: { status: 'down' } } };

      expect(mapException(new ServiceUnavailableException(body))).toMatchObject({
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        details: body,
      });
    });

    it('falls back for unlisted statuses', () => {
      expect(mapException(new HttpException('teapot', 418)).code).toBe('BAD_REQUEST');
      expect(mapException(new HttpException('gateway', 502)).code).toBe('INTERNAL_ERROR');
    });
  });

  describe('body parser errors', () => {
    it('maps an oversized body to 413', () => {
      const error = Object.assign(new Error('request entity too large'), { status: 413 });

      expect(mapException(error)).toEqual({
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large',
      });
    });

    it('maps other client errors to 400 without echoing the parser message', () => {
      const error = Object.assign(new Error('Unexpected token } in JSON at position 3'), {
        statusCode: 400,
      });

      expect(mapException(error)).toEqual({
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Malformed request',
      });
    });
  });

  it('hides unknown errors', () => {
    expect(mapException(new Error('password=hunter2'))).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(mapException('a string')).toMatchObject({ status: 500 });
    expect(mapException(undefined)).toMatchObject({ status: 500 });
  });
});
