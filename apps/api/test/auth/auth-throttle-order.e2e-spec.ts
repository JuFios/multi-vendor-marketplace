import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { RateLimit } from '../../src/common/throttling';
import { bearerFor } from '../utils/auth';
import { overrideEnv } from '../utils/env';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

@Controller('throttle-order-probe')
class ProbeController {
  @Get('bid')
  @RateLimit('bid')
  bid(): { ok: true } {
    return { ok: true };
  }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

// The bid limiter keys on `request.user`, so the JWT guard has to run before the throttler guard.
describe('Per-user rate limiting behind the JWT guard (e2e)', () => {
  let app: NestExpressApplication;
  let restore: () => void;
  beforeAll(async () => {
    restore = overrideEnv({ THROTTLE_BID_LIMIT: '2', THROTTLE_BID_TTL: '60' });
    app = await createTestApp([], { imports: [ProbeModule], worker: false });
    await resetThrottleCounters(app);
  });
  afterAll(async () => {
    await resetThrottleCounters(app);
    await app.close();
    restore();
  });
  it('counts each authenticated user separately although they share an address', async () => {
    const a = await bearerFor(app, { id: '11111111-1111-4111-8111-111111111111' });
    const b = await bearerFor(app, { id: '22222222-2222-4222-8222-222222222222' });
    const get = (auth: string) =>
      request(app.getHttpServer()).get('/api/throttle-order-probe/bid').set('Authorization', auth);
    const statuses: number[] = [];
    for (const auth of [a, a, a, b, b, b]) statuses.push((await get(auth)).status);
    expect(statuses).toEqual([200, 200, 429, 200, 200, 429]);
  });
});
