import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/prisma';

import { cookieValue, refreshCookieOf } from './utils/auth';
import { resetDb } from './utils/db';
import { overrideEnv } from './utils/env';
import { createTestApp } from './utils/test-app';
import { resetThrottleCounters } from './utils/throttle';

interface SessionBody {
  accessToken: string;
  user: { id: string; roles: string[] };
}

const EMAIL = 'flow@example.com';
const PASSWORD = 'correct-horse-1';

describe('Refresh rotation, reuse detection and logout (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;

  const http = () => request(app.getHttpServer());
  const refresh = (token: string | undefined, headers: Record<string, string> = {}) => {
    const call = http()
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set(headers);
    return token === undefined ? call : call.set('Cookie', `rt=${token}`);
  };
  const logout = (token?: string) => {
    const call = http().post('/api/auth/logout');
    return token === undefined ? call : call.set('Cookie', `rt=${token}`);
  };
  const me = (accessToken: string) =>
    http().get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);

  const signIn = async (): Promise<{ accessToken: string; token: string }> => {
    const response = await http()
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    return {
      accessToken: (response.body as SessionBody).accessToken,
      token: cookieValue(refreshCookieOf(response)),
    };
  };

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      THROTTLE_LOGIN_LIMIT: '1000',
      THROTTLE_REGISTER_LIMIT: '1000',
      THROTTLE_REFRESH_LIMIT: '1000',
    });
    app = await createTestApp([], { worker: false });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await resetThrottleCounters(app);
    await http()
      .post('/api/auth/register')
      .send({ email: EMAIL, password: PASSWORD, name: 'Flow' });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  it('walks the whole flow: login, me, rotate, reuse kills the family, logout', async () => {
    const first = await signIn();
    await me(first.accessToken).expect(200);

    const rotated = await refresh(first.token).expect(200);
    const second = {
      accessToken: (rotated.body as SessionBody).accessToken,
      token: cookieValue(refreshCookieOf(rotated)),
    };
    expect(second.token).not.toBe(first.token);
    await me(second.accessToken).expect(200);

    // The first token no longer works, and presenting it again burns the whole family.
    const replay = await refresh(first.token);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ error: { code: 'REFRESH_TOKEN_REUSED' } });

    const afterReplay = await refresh(second.token);
    expect(afterReplay.status).toBe(401);
    expect(afterReplay.body).toMatchObject({ error: { code: 'REFRESH_TOKEN_REUSED' } });

    await logout(second.token).expect(204);
  });

  it('sets a new cookie with the same attributes on every rotation', async () => {
    const { token } = await signIn();

    const cookie = refreshCookieOf(await refresh(token).expect(200));

    expect(cookie).toMatch(/^rt=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth');
  });

  it('keeps the family and chains the rotated rows', async () => {
    const { token } = await signIn();
    await refresh(token).expect(200);

    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    const [registered, signedIn, rotated] = rows;

    expect(rows).toHaveLength(3);
    expect(rotated!.familyId).toBe(signedIn!.familyId);
    expect(registered!.familyId).not.toBe(signedIn!.familyId);
    expect(signedIn!.revokedAt).not.toBeNull();
    expect(signedIn!.replacedById).toBe(rotated!.id);
    expect(rotated!.revokedAt).toBeNull();
  });

  it('revokes only the family that was replayed', async () => {
    const phone = await signIn();
    const laptop = await signIn();
    await refresh(phone.token).expect(200);

    await refresh(phone.token).expect(401);

    await refresh(laptop.token).expect(200);
  });

  it('lets exactly one of two simultaneous refreshes with the same token win', async () => {
    const { token } = await signIn();

    const [a, b] = await Promise.all([refresh(token), refresh(token)]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const winner = a.status === 200 ? a : b;
    // The loser looked like a replay, so the winner's new token is dead as well.
    await refresh(cookieValue(refreshCookieOf(winner))).expect(401);
  });

  it('reflects role changes after a refresh', async () => {
    const { accessToken, token } = await signIn();
    const userId = (
      await me(accessToken)
        .expect(200)
        .then((r) => r.body as { id: string })
    ).id;
    await prisma.user.update({ where: { id: userId }, data: { roles: ['CUSTOMER', 'SELLER'] } });

    const rotated = await refresh(token).expect(200);

    expect((rotated.body as SessionBody).user.roles).toEqual(['CUSTOMER', 'SELLER']);
    const profile = await me((rotated.body as SessionBody).accessToken).expect(200);
    expect((profile.body as { roles: string[] }).roles).toEqual(['CUSTOMER', 'SELLER']);
  });

  describe('rejections', () => {
    it('requires the X-Requested-With header and rotates nothing without it', async () => {
      const { token } = await signIn();

      const response = await http().post('/api/auth/refresh').set('Cookie', `rt=${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: { code: 'CSRF_HEADER_REQUIRED' } });
      await refresh(token).expect(200);
    });

    it('rejects a missing cookie and clears it', async () => {
      const response = await refresh(undefined);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'INVALID_REFRESH_TOKEN' } });
      expect(refreshCookieOf(response)).toMatch(/^rt=;/);
    });

    it('rejects a token that was never issued', async () => {
      const response = await refresh('A'.repeat(43));

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'INVALID_REFRESH_TOKEN' } });
    });

    it('rejects an expired token without revoking its family', async () => {
      const { token } = await signIn();
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await refresh(token);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'INVALID_REFRESH_TOKEN' } });
      expect(await prisma.refreshToken.count({ where: { revokedAt: { not: null } } })).toBe(0);
    });

    it('does not accept the refresh token as a bearer token', async () => {
      const { token } = await signIn();

      await me(token).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the family, clears the cookie and blocks further refreshes', async () => {
      const { token } = await signIn();
      const rotated = await refresh(token).expect(200);
      const current = cookieValue(refreshCookieOf(rotated));

      const response = await logout(current);

      expect(response.status).toBe(204);
      expect(refreshCookieOf(response)).toMatch(/^rt=;.*Path=\/api\/auth/);
      await refresh(current).expect(401);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null, user: { email: EMAIL } } }),
      ).toBe(1); // the token issued at registration belongs to another family
    });

    it('also works through an already rotated token', async () => {
      const { token } = await signIn();
      const rotated = await refresh(token).expect(200);

      await logout(token).expect(204);

      await refresh(cookieValue(refreshCookieOf(rotated))).expect(401);
    });

    it('succeeds without a cookie or with a bogus one', async () => {
      await logout().expect(204);
      await logout('bogus').expect(204);
    });
  });
});
