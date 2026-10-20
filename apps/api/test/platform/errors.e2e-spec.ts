import { Controller, Get, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerException } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';

import { Public } from '../../src/common/decorators/public.decorator';
import { AppError, ConflictError } from '../../src/common/exceptions/app-error';
import { Prisma } from '../../src/generated/prisma/client';
import { createTestApp } from '../utils/test-app';

@Public()
@Controller('probe')
class ProbeController {
  @Get('app-error')
  appError(): never {
    throw new AppError('PRODUCT_NOT_FOUND', 404, 'No such product', { id: 'p-1' });
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictError();
  }

  @Get('prisma-unique')
  prismaUnique(): never {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
  }

  @Get('prisma-missing')
  prismaMissing(): never {
    throw new Prisma.PrismaClientKnownRequestError('No record found', {
      code: 'P2025',
      clientVersion: 'test',
    });
  }

  @Get('throttled')
  throttled(): never {
    throw new ThrottlerException();
  }

  @Get('redis-down')
  redisDown(): never {
    const error = new Error('Reached the max retries per request limit (redis://secret:6379)');
    error.name = 'MaxRetriesPerRequestError';
    throw error;
  }

  @Get('crash')
  crash(): never {
    throw new Error('password=hunter2 at /srv/app/secret.ts');
  }

  @Post('echo')
  echo(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Error responses (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([], { imports: [ProbeModule], worker: false });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, requestId?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return requestId === undefined ? call : call.set('X-Request-Id', requestId);
  };

  it('renders an AppError with the caller-supplied correlation id', async () => {
    const response = await get('/api/probe/app-error', 'trace-42').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'No such product',
        details: { id: 'p-1' },
        correlationId: 'trace-42',
      },
    });
    expect(response.headers['x-request-id']).toBe('trace-42');
  });

  it('generates a correlation id that matches the response header', async () => {
    const response = await get('/api/probe/conflict').expect(409);

    const body = response.body as { error: { code: string; correlationId: string } };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.correlationId).toBe(response.headers['x-request-id']);
  });

  it('maps a Prisma unique violation to 409 CONFLICT', async () => {
    const response = await get('/api/probe/prisma-unique').expect(409);

    expect(response.body).toMatchObject({
      error: { code: 'CONFLICT', details: { fields: ['email'] } },
    });
  });

  it('maps a missing Prisma record to 404 NOT_FOUND', async () => {
    const response = await get('/api/probe/prisma-missing').expect(404);

    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('maps throttling to 429 RATE_LIMITED', async () => {
    const response = await get('/api/probe/throttled').expect(429);

    expect(response.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('maps a dependency connection failure to 503 without leaking its message', async () => {
    const response = await get('/api/probe/redis-down').expect(503);

    expect(response.body).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('hides unexpected failures behind INTERNAL_ERROR', async () => {
    const response = await get('/api/probe/crash').expect(500);

    expect(response.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|secret\.ts|\bat\b.*\(/);
  });

  it('answers unknown routes with the uniform 404 body', async () => {
    const response = await get('/api/nope').expect(404);

    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(
      (response.body as { error: { correlationId?: string } }).error.correlationId,
    ).toBeTruthy();
  });

  it('answers malformed JSON with 400 BAD_REQUEST', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/probe/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });

  it('counts errors by code in /metrics', async () => {
    await get('/api/probe/app-error').expect(404);

    const metrics = await request(app.getHttpServer() as App)
      .get('/metrics')
      .expect(200);

    expect(metrics.text).toMatch(/app_errors_total\{code="PRODUCT_NOT_FOUND"\} [1-9]/);
    expect(metrics.text).toMatch(/app_errors_total\{code="INTERNAL_ERROR"\} [1-9]/);
  });
});
