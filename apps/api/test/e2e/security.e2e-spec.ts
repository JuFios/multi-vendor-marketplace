import { Controller, Get, Module, Post, Req, type MiddlewareConsumer } from '@nestjs/common';
import type { NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { HealthModule } from '../../src/health/health.module';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module';
import { REDIS_CLIENT } from '../../src/infrastructure/redis';
import { RateLimit, ThrottlingModule } from '../../src/infrastructure/throttling';
import { createTestAppFrom, type TestApp } from '../helpers/test-app';

@Controller('probe')
class ProbeController {
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('cookies')
  cookies(@Req() req: Request): Record<string, string> {
    return req.cookies as Record<string, string>;
  }

  @Post('echo')
  echo(): { ok: true } {
    return { ok: true };
  }

  @Get('login')
  @RateLimit('login')
  login(): { ok: true } {
    return { ok: true };
  }

  @Get('bid')
  @RateLimit('bid')
  bid(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [InfrastructureModule, ThrottlingModule, HealthModule],
  controllers: [ProbeController],
})
class ProbeModule implements NestModule {
  // Stands in for the authentication that arrives later: identifies the caller by a header.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) => {
        const user = req.headers['x-test-user'];
        if (typeof user === 'string') {
          (req as Request & { user?: { id: string } }).user = { id: user };
        }
        next();
      })
      .forRoutes('*');
  }
}

const OVERRIDES: Record<string, string> = {
  WEB_URL: 'http://localhost:5173',
  TRUST_PROXY: '1',
  BODY_LIMIT: '1kb',
  THROTTLE_LOGIN_LIMIT: '2',
  THROTTLE_LOGIN_TTL: '60',
  THROTTLE_BID_LIMIT: '2',
  THROTTLE_BID_TTL: '60',
};

describe('HTTP hardening and rate limiting (e2e)', () => {
  let app: TestApp;
  const previous = new Map<string, string | undefined>();

  const asClient = (ip: string): { 'X-Forwarded-For': string } => ({ 'X-Forwarded-For': ip });

  beforeAll(async () => {
    for (const [name, value] of Object.entries(OVERRIDES)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
    app = await createTestAppFrom({ imports: [ProbeModule] });
    const redis = app.get<Redis>(REDIS_CLIENT);
    const stale = await redis.keys('throttle:*');
    if (stale.length > 0) {
      await redis.del(...stale);
    }
  });

  afterAll(async () => {
    await app.close();
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  describe('headers, CORS, cookies and body size', () => {
    it('sets security headers and hides the framework', async () => {
      const response = await request(app.getHttpServer()).get('/api/probe/open').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('allows credentialed requests from the configured web origin only', async () => {
      const allowed = await request(app.getHttpServer())
        .options('/api/probe/open')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      const denied = await request(app.getHttpServer())
        .options('/api/probe/open')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');

      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      // The browser compares this with the request origin and rejects the mismatch.
      expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });

    it('parses cookies', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/probe/cookies')
        .set('Cookie', 'rt=abc')
        .expect(200);

      expect(response.body).toEqual({ rt: 'abc' });
    });

    it('rejects bodies over the configured limit with 413', async () => {
      await request(app.getHttpServer())
        .post('/api/probe/echo')
        .send({ blob: 'x'.repeat(2048) })
        .expect(413);
      await request(app.getHttpServer()).post('/api/probe/echo').send({ ok: true }).expect(201);
    });
  });

  describe('rate limiting', () => {
    it('blocks an opted-in route after the limit and reports Retry-After', async () => {
      const client = asClient('10.0.0.1');

      await request(app.getHttpServer()).get('/api/probe/login').set(client).expect(200);
      await request(app.getHttpServer()).get('/api/probe/login').set(client).expect(200);
      const blocked = await request(app.getHttpServer())
        .get('/api/probe/login')
        .set(client)
        .expect(429);

      expect(Number(blocked.headers['retry-after-login'])).toBeGreaterThan(0);
    });

    it('counts each client address separately', async () => {
      for (const ip of ['10.0.1.1', '10.0.1.2']) {
        await request(app.getHttpServer()).get('/api/probe/login').set(asClient(ip)).expect(200);
      }
    });

    it('does not apply named throttlers to routes that did not opt in', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer())
          .get('/api/probe/open')
          .set(asClient('10.0.2.1'))
          .expect(200);
      }
    });

    it('limits bids per authenticated user rather than per address', async () => {
      const send = (user: string, ip: string) =>
        request(app.getHttpServer())
          .get('/api/probe/bid')
          .set({ 'X-Test-User': user, ...asClient(ip) });

      await send('user-a', '10.0.3.1').expect(200);
      await send('user-a', '10.0.3.2').expect(200);
      await send('user-a', '10.0.3.3').expect(429);
      await send('user-b', '10.0.3.1').expect(200);
    });

    it('never throttles the liveness and readiness probes', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer()).get('/api/health').set(asClient('10.0.4.1')).expect(200);
      }
    });
  });
});
