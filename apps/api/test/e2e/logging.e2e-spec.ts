import { Writable } from 'node:stream';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { LOG_STREAM } from '../../src/infrastructure/logger';
import { createTestApp } from '../helpers/test-app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Request logging and correlation id (e2e)', () => {
  let app: INestApplication<App>;
  const chunks: string[] = [];
  let previousLevel: string | undefined;

  const requestLogs = (): Record<string, unknown>[] =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.msg === 'request completed');

  beforeAll(async () => {
    previousLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    app = await createTestApp([{ token: LOG_STREAM, useValue: stream }]);
  });

  afterAll(async () => {
    await app.close();
    if (previousLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previousLevel;
    }
  });

  beforeEach(() => {
    chunks.length = 0;
  });

  it('echoes a valid X-Request-Id and puts it on the request log line', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'test-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-123');
    expect(requestLogs()).toEqual([
      expect.objectContaining({
        msg: 'request completed',
        level: 30,
        correlationId: 'test-123',
        method: 'GET',
        route: '/api/health',
        statusCode: 200,
        durationMs: expect.any(Number) as number,
      }),
    ]);
  });

  it('generates an id when none is supplied', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    const id = response.headers['x-request-id'];
    expect(id).toMatch(UUID_PATTERN);
    expect(requestLogs()[0]).toMatchObject({ correlationId: id });
  });

  it('replaces a malformed id instead of echoing it', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'bad id with spaces!')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('logs the route template and keeps raw query strings out of the line', async () => {
    await request(app.getHttpServer()).get('/api/health?token=secret').expect(200);

    const [entry] = requestLogs();
    expect(entry).toMatchObject({ route: '/api/health' });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('also covers the metrics endpoint, which lives outside the api prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .set('X-Request-Id', 'scrape-2')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('scrape-2');
    expect(requestLogs()[0]).toMatchObject({ route: '/metrics', correlationId: 'scrape-2' });
  });

  it('logs unknown routes as unmatched with a warn level', async () => {
    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);

    expect(requestLogs()[0]).toMatchObject({ route: 'unmatched', statusCode: 404, level: 40 });
  });
});
