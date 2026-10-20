import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/prisma/prisma.service';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

describe('Auth rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let restoreEnv: () => void;

  const http = () => request(app.getHttpServer());
  const loginAs = (email: string, ip: string) =>
    http()
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'wrong-pass-1' });

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      TRUST_PROXY: '1',
      THROTTLE_LOGIN_LIMIT: '5',
      THROTTLE_LOGIN_TTL: '60',
      THROTTLE_REFRESH_LIMIT: '3',
      THROTTLE_REFRESH_TTL: '60',
      THROTTLE_REGISTER_LIMIT: '2',
      THROTTLE_REGISTER_TTL: '60',
    });
    app = await createTestApp([], { worker: false });
    await resetDb(app.get(PrismaService));
  });

  beforeEach(() => resetThrottleCounters(app));

  afterAll(async () => {
    await resetThrottleCounters(app);
    await app.close();
    restoreEnv();
  });

  it('answers the 6th login attempt within a minute from one address with 429', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await loginAs(`user${attempt}@example.com`, '198.51.100.1').expect(401);
    }

    const response = await loginAs('user6@example.com', '198.51.100.1');

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('limits attempts against one account even when they come from different addresses', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await loginAs('victim@example.com', `198.51.100.${attempt + 10}`).expect(401);
    }

    await loginAs('victim@example.com', '198.51.100.99').expect(429);
    await loginAs('someone-else@example.com', '198.51.100.99').expect(401);
  });

  it('treats the same account written in another case as one account', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await loginAs('Case@Example.com', `198.51.100.${attempt + 20}`).expect(401);
    }

    await loginAs('case@example.com', '198.51.100.77').expect(429);
  });

  it('limits registrations per address', async () => {
    const registerFrom = (email: string) =>
      http()
        .post('/api/auth/register')
        .set('X-Forwarded-For', '198.51.100.50')
        .send({ email, password: 'correct-horse-1', name: 'Limited' });

    await registerFrom('one@example.com').expect(201);
    await registerFrom('two@example.com').expect(201);
    await registerFrom('three@example.com').expect(429);
  });

  it('limits refresh attempts per address', async () => {
    const refreshFrom = () =>
      http()
        .post('/api/auth/refresh')
        .set('X-Forwarded-For', '198.51.100.60')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', 'rt=unknown');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await refreshFrom().expect(401);
    }
    await refreshFrom().expect(429);
  });
});
