import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/prisma';

import { cookieValue, refreshCookieOf } from './utils/auth';
import { resetDb } from './utils/db';
import { overrideEnv } from './utils/env';
import { createTestApp } from './utils/test-app';

describe('COOKIE_SECURE (e2e)', () => {
  let app: NestExpressApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = overrideEnv({ COOKIE_SECURE: 'true', THROTTLE_REGISTER_LIMIT: '1000' });
    app = await createTestApp([], { worker: false });
    await resetDb(app.get(PrismaService));
  });

  afterAll(async () => {
    await resetDb(app.get(PrismaService));
    await app.close();
    restoreEnv();
  });

  it('marks the refresh cookie Secure when it is on, also when it is cleared', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'secure@example.com', password: 'correct-horse-1', name: 'Secure' })
      .expect(201);
    const cookie = refreshCookieOf(registered);
    expect(cookie).toContain('Secure');

    const loggedOut = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', `rt=${cookieValue(cookie)}`)
      .expect(204);
    expect(refreshCookieOf(loggedOut)).toContain('Secure');
  });
});
