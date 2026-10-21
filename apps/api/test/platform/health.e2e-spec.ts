import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { REDIS_CLIENT } from '../../src/redis/redis.constants';
import { MEILI_CLIENT } from '../../src/search/meili.constants';
import { createTestApp } from '../utils/test-app';

describe('health (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health answers 200 with status ok', async () => {
    app = await createTestApp([], { worker: false });

    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready reports Postgres and Redis up, with the search index in details', async () => {
    app = await createTestApp([], { worker: false });

    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
      details: { search: { status: 'up' } },
    });
  });

  it('GET /api/health/ready stays ready while the search index is down', async () => {
    app = await createTestApp(
      [
        {
          token: MEILI_CLIENT,
          useValue: { health: () => Promise.reject(new Error('unreachable')) },
        },
      ],
      { worker: false },
    );

    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
      details: { search: { status: 'down' } },
    });
  });

  it('GET /api/health/ready answers 503 while Redis is down', async () => {
    app = await createTestApp(
      [
        {
          token: REDIS_CLIENT,
          // `status` keeps the shutdown hook from quitting a connection that is not there.
          useValue: { status: 'end', ping: () => Promise.reject(new Error('unreachable')) },
        },
      ],
      { worker: false },
    );

    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        details: {
          error: { redis: { status: 'down' } },
          info: { database: { status: 'up' } },
        },
      },
    });
  });
});
