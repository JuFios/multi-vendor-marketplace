import { Writable } from 'node:stream';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';

import { LOG_STREAM } from '../../src/logger/logger.constants';
import { createTestApp } from '../utils/test-app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('request logging and correlation id (e2e)', () => {
  let app: NestExpressApplication;
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
    app = await createTestApp([{ token: LOG_STREAM, useValue: stream }], { worker: false });
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
    const response = await request(app.getHttpServer() as App)
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
    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .expect(200);

    const id = response.headers['x-request-id'];
    expect(id).toMatch(UUID_PATTERN);
    expect(requestLogs()[0]).toMatchObject({ correlationId: id });
  });

  it('replaces a malformed id instead of echoing it', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/health')
      .set('X-Request-Id', 'bad id with spaces!')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('logs the route template and keeps raw query strings out of the line', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/health?token=secret')
      .expect(200);

    const [entry] = requestLogs();
    expect(entry).toMatchObject({ route: '/api/health' });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('logs unknown routes as unmatched with a warn level', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/does-not-exist')
      .expect(404);

    expect(requestLogs()[0]).toMatchObject({ route: 'unmatched', statusCode: 404, level: 40 });
  });
});
