import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';

import { createTestApp } from './utils/test-app';

describe('Metrics (e2e)', () => {
  let app: NestExpressApplication;

  const scrape = async (): Promise<string> => {
    const response = await request(app.getHttpServer() as App)
      .get('/metrics')
      .expect(200);
    return response.text;
  };

  beforeAll(async () => {
    app = await createTestApp([], { worker: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves Prometheus text with default process metrics outside the api prefix', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/metrics')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# TYPE process_cpu_user_seconds_total counter');
    await request(app.getHttpServer() as App)
      .get('/api/metrics')
      .expect(404);
  });

  it('counts requests by route template and status', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(200);

    const text = await scrape();
    expect(text).toMatch(
      /http_requests_total\{method="GET",route="\/api\/health",status="200"\} [1-9]/,
    );
    expect(text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/api\/health",status="200"\} [1-9]/,
    );
  });

  it('counts unknown routes under one bounded label', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/no-such-page-1')
      .expect(404);
    await request(app.getHttpServer() as App)
      .get('/api/no-such-page-2')
      .expect(404);

    const text = await scrape();
    expect(text).toMatch(
      /http_requests_total\{method="GET",route="unmatched",status="404"\} [2-9]/,
    );
    expect(text).not.toContain('no-such-page');
  });

  it('carries a correlation id on the scrape response', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/metrics')
      .set('X-Request-Id', 'scrape-1')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('scrape-1');
  });
});
