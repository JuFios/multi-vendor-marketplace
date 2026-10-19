import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MEILI_CLIENT } from '../src/search';

async function createApp(
  customize?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  customize?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('health (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health answers 200 with status ok', async () => {
    app = await createApp();

    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready reports Postgres, Redis and Meilisearch up', async () => {
    app = await createApp();

    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' }, search: { status: 'up' } },
    });
  });

  it('GET /api/health/ready answers 503 while a dependency is down', async () => {
    app = await createApp((builder) => {
      builder
        .overrideProvider(MEILI_CLIENT)
        .useValue({ health: () => Promise.reject(new Error('unreachable')) });
    });

    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      error: { search: { status: 'down' } },
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });
});
