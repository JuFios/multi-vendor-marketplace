import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { REDIS_CLIENT } from '../../src/infrastructure/redis';
import { createTestApp } from '../helpers/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready reports every dependency up', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: {
        database: { status: 'up' },
        redis: { status: 'up' },
        search: { status: 'up' },
      },
      error: {},
    });
  });
});

describe('Health readiness with an unavailable dependency (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const unreachableRedis = {
      ping: () => Promise.reject(new Error('ECONNREFUSED')),
      quit: () => Promise.resolve('OK'),
      status: 'end',
    };
    app = await createTestApp([{ token: REDIS_CLIENT, useValue: unreachableRedis }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/ready responds 503 and names the failing dependency', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      info: { database: { status: 'up' }, search: { status: 'up' } },
      error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
    });
  });

  it('GET /api/health stays live', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
