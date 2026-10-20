import { Writable } from 'node:stream';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { LOG_STREAM } from '../../src/logger/logger.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { bearerFor } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';

describe('Authenticated user in the log context (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const chunks: string[] = [];

  const requestLogs = (): Record<string, unknown>[] =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.msg === 'request completed');

  beforeAll(async () => {
    restoreEnv = overrideEnv({ LOG_LEVEL: 'info' });
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    app = await createTestApp([{ token: LOG_STREAM, useValue: stream }], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    chunks.length = 0;
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  it('puts the user id on the request line, and never the token', async () => {
    const user = await createUser(prisma);
    const authorization = await bearerFor(app, user);

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', authorization)
      .expect(200);

    const [line] = requestLogs();
    expect(line).toMatchObject({ route: '/api/users/me', statusCode: 200, userId: user.id });
    expect(chunks.join('')).not.toContain(authorization.slice('Bearer '.length));
  });

  it('logs no user id for an anonymous request', async () => {
    await request(app.getHttpServer()).get('/api/users/me').expect(401);

    const [line] = requestLogs();
    expect(line).toMatchObject({ statusCode: 401 });
    expect(line).not.toHaveProperty('userId');
  });
});
