import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { GoogleProfile } from '../../src/modules/auth/google-login';
import { GoogleStrategy } from '../../src/modules/auth/strategies/google.strategy';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cookieValue, refreshCookieOf } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createUser } from '../utils/factories';
import {
  FAKE_GOOGLE_AUTH_URL,
  FakeGoogleStrategy,
  googleCode,
} from '../utils/fake-google-strategy';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

const WEB_CALLBACK = 'http://localhost:5173/auth/callback';
const PASSWORD = 'correct-horse-1';

const profile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'google-sub-1',
  email: 'olena@example.com',
  emailVerified: true,
  name: 'Olena Koval',
  ...overrides,
});

interface SessionBody {
  accessToken: string;
}

describe('Google sign-in (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;

  const http = () => request(app.getHttpServer());
  const register = (email: string) =>
    http().post('/api/auth/register').send({ email, password: PASSWORD, name: 'Olena' });
  const passwordLogin = (email: string) =>
    http().post('/api/auth/login').send({ email, password: PASSWORD });
  const refresh = (token: string) =>
    http()
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `rt=${token}`);

  /** The browser's round trip: start the flow, then come back from Google with the same state. */
  async function signInWithGoogle(
    google: GoogleProfile,
    { state }: { state?: string | null } = {},
  ): Promise<request.Response> {
    const start = await http().get('/api/auth/google').expect(302);
    const issued = new URL(start.headers.location!).searchParams.get('state')!;
    const sent = state === undefined ? issued : state;
    const query = new URLSearchParams({ code: googleCode(google) });
    if (sent !== null) {
      query.set('state', sent);
    }
    return http()
      .get(`/api/auth/google/callback?${query.toString()}`)
      .set('Cookie', `g_state=${issued}`);
  }

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
      THROTTLE_LOGIN_LIMIT: '1000',
      THROTTLE_REGISTER_LIMIT: '1000',
      THROTTLE_REFRESH_LIMIT: '1000',
    });
    app = await createTestApp([{ token: GoogleStrategy, useValue: new FakeGoogleStrategy() }], {
      worker: false,
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await resetThrottleCounters(app);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
    restoreEnv();
  });

  describe('starting the flow', () => {
    it('reports Google as available', async () => {
      const response = await http().get('/api/auth/providers').expect(200);

      expect(response.body).toEqual({ google: true });
    });

    it('redirects to Google and remembers the state in a short-lived cookie', async () => {
      const response = await http().get('/api/auth/google').expect(302);
      const location = new URL(response.headers.location!);
      const cookie = ((response.headers['set-cookie'] as unknown as string[]) ?? []).find((c) =>
        c.startsWith('g_state='),
      )!;

      expect(`${location.origin}${location.pathname}`).toBe(FAKE_GOOGLE_AUTH_URL);
      expect(cookie.split(';')[0]).toBe(`g_state=${location.searchParams.get('state')}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth/google');
      expect(cookie).toContain('SameSite=Lax');
    });
  });

  describe('a new Google user', () => {
    it('is created without a password and sent back to the SPA without tokens in the URL', async () => {
      const response = await signInWithGoogle(profile({ email: 'Olena@Example.com' }));

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(WEB_CALLBACK);
      expect(JSON.stringify(response.headers)).not.toMatch(/eyJ/);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'olena@example.com' } });
      expect(user).toMatchObject({
        passwordHash: null,
        emailVerified: true,
        roles: ['CUSTOMER'],
        name: 'Olena Koval',
      });
      expect(await prisma.authIdentity.findMany()).toEqual([
        expect.objectContaining({
          userId: user.id,
          provider: 'GOOGLE',
          providerUserId: 'google-sub-1',
          email: 'olena@example.com',
        }),
      ]);
    });

    it('gets the refresh cookie, and the SPA turns it into an access token', async () => {
      const response = await signInWithGoogle(profile());
      const cookie = refreshCookieOf(response);

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');

      const refreshed = await refresh(cookieValue(cookie)).expect(200);
      const me = await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${(refreshed.body as SessionBody).accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({ email: 'olena@example.com', emailVerified: true });
    });

    it('cannot sign in with a password it does not have', async () => {
      await signInWithGoogle(profile());

      await passwordLogin('olena@example.com').expect(401);
    });

    it('is the same user the next time', async () => {
      await signInWithGoogle(profile());
      await signInWithGoogle(profile({ email: 'changed-address@example.com' }));

      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.authIdentity.count()).toBe(1);
    });
  });

  describe('merging into an existing account', () => {
    it('clears the password, verifies the email and revokes sessions opened before', async () => {
      const registered = await register('olena@example.com').expect(201);
      const oldToken = cookieValue(refreshCookieOf(registered));
      const before = await prisma.user.findUniqueOrThrow({ where: { email: 'olena@example.com' } });
      expect(before.emailVerified).toBe(false);

      const response = await signInWithGoogle(profile({ email: 'OLENA@example.com' }));

      expect(response.headers.location).toBe(WEB_CALLBACK);
      const after = await prisma.user.findUniqueOrThrow({ where: { email: 'olena@example.com' } });
      expect(before.passwordHash).not.toBeNull();
      expect(after.passwordHash).toBeNull();
      expect(after.emailVerified).toBe(true);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.authIdentity.findMany()).toEqual([
        expect.objectContaining({ userId: before.id, providerUserId: 'google-sub-1' }),
      ]);

      // The session opened before Google proved the mailbox is gone ...
      await refresh(oldToken).expect(401);
      // ... the one Google just opened works ...
      await refresh(cookieValue(refreshCookieOf(response))).expect(200);
      // ... the password set by whoever registered first no longer does ...
      await passwordLogin('olena@example.com').expect(401);
      // ... and Google keeps signing the owner in.
      await signInWithGoogle(profile()).then((r) => expect(r.headers.location).toBe(WEB_CALLBACK));
    });

    it('lets the owner set a new password from the Google session, and only them', async () => {
      await register('olena@example.com').expect(201);
      const google = await signInWithGoogle(profile());
      const session = await refresh(cookieValue(refreshCookieOf(google))).expect(200);
      const bearer = `Bearer ${(session.body as SessionBody).accessToken}`;
      const me = () => http().get('/api/users/me').set('Authorization', bearer);
      const setPassword = (body: object) =>
        http().post('/api/users/me/password').set('Authorization', bearer).send(body);

      expect((await me().expect(200)).body).toMatchObject({ hasPassword: false });
      await setPassword({ newPassword: 'owner-pass-2026' }).expect(204);

      expect((await me().expect(200)).body).toMatchObject({ hasPassword: true });
      await http()
        .post('/api/auth/login')
        .send({ email: 'olena@example.com', password: 'owner-pass-2026' })
        .expect(200);
      // The pre-registered password stays dead.
      await passwordLogin('olena@example.com').expect(401);

      // Once a password exists, changing it needs the current one.
      await setPassword({ newPassword: 'another-pass-1' }).expect(400);
      await setPassword({ currentPassword: 'wrong-pass-1', newPassword: 'another-pass-1' }).expect(
        400,
      );
      await setPassword({
        currentPassword: 'owner-pass-2026',
        newPassword: 'another-pass-1',
      }).expect(204);
      await http()
        .post('/api/auth/login')
        .send({ email: 'olena@example.com', password: 'another-pass-1' })
        .expect(200);
    });

    it('does not let a session from before the link set the cleared password', async () => {
      // Whoever pre-registered the address still holds an access token from before the link.
      const registered = await register('olena@example.com').expect(201);
      const stale = `Bearer ${(registered.body as SessionBody).accessToken}`;
      // The link is at least a second younger than that token.
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      await signInWithGoogle(profile());

      const refused = await http()
        .post('/api/users/me/password')
        .set('Authorization', stale)
        .send({ newPassword: 'squatter-pass-1' })
        .expect(403);
      expect((refused.body as { error: { code: string } }).error.code).toBe(
        'FRESH_SIGN_IN_REQUIRED',
      );
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email: 'olena@example.com' } }))
          .passwordHash,
      ).toBeNull();
    }, 20_000);

    it('leaves the sessions of an already verified account alone', async () => {
      const registered = await register('olena@example.com').expect(201);
      const oldToken = cookieValue(refreshCookieOf(registered));
      await prisma.user.update({
        where: { email: 'olena@example.com' },
        data: { emailVerified: true },
      });

      await signInWithGoogle(profile()).then((r) => expect(r.headers.location).toBe(WEB_CALLBACK));

      await refresh(oldToken).expect(200);
      await passwordLogin('olena@example.com').expect(200);
    });

    it('never merges on an email Google has not verified', async () => {
      const registered = await register('olena@example.com').expect(201);
      const oldToken = cookieValue(refreshCookieOf(registered));

      const response = await signInWithGoogle(profile({ emailVerified: false }));

      expect(response.headers.location).toBe(`${WEB_CALLBACK}?error=GOOGLE_EMAIL_NOT_VERIFIED`);
      expect(refreshCookieOf(response)).toBe('');
      expect(await prisma.authIdentity.count()).toBe(0);
      await refresh(oldToken).expect(200);
      await passwordLogin('olena@example.com').expect(200);
    });
  });

  describe('failures', () => {
    it('refuses an unverified Google email for a new user and creates nothing', async () => {
      const response = await signInWithGoogle(profile({ emailVerified: false }));

      expect(response.headers.location).toBe(`${WEB_CALLBACK}?error=GOOGLE_EMAIL_NOT_VERIFIED`);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.authIdentity.count()).toBe(0);
    });

    it.each([
      ['a state that does not match', 'tampered'],
      ['no state at all', null],
    ])('refuses a callback with %s', async (_label, state) => {
      const response = await signInWithGoogle(profile(), { state });

      expect(response.headers.location).toBe(`${WEB_CALLBACK}?error=GOOGLE_AUTH_FAILED`);
      expect(refreshCookieOf(response)).toBe('');
      expect(await prisma.user.count()).toBe(0);
    });

    it('refuses a callback that did not start in this browser (no state cookie)', async () => {
      const response = await http().get(
        `/api/auth/google/callback?code=${googleCode(profile())}&state=whatever`,
      );

      expect(response.headers.location).toBe(`${WEB_CALLBACK}?error=GOOGLE_AUTH_FAILED`);
      expect(await prisma.user.count()).toBe(0);
    });

    it('sends a cancelled consent back with an error code', async () => {
      const start = await http().get('/api/auth/google');
      const state = new URL(start.headers.location!).searchParams.get('state')!;

      const response = await http()
        .get(`/api/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', `g_state=${state}`);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${WEB_CALLBACK}?error=GOOGLE_AUTH_FAILED`);
    });

    it('does not let a state be used twice', async () => {
      const start = await http().get('/api/auth/google');
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      const callback = () =>
        http()
          .get(`/api/auth/google/callback?code=${googleCode(profile())}&state=${state}`)
          .set('Cookie', `g_state=${state}`);

      const first = await callback();
      const cleared = ((first.headers['set-cookie'] as unknown as string[]) ?? []).find((c) =>
        c.startsWith('g_state='),
      );

      expect(first.headers.location).toBe(WEB_CALLBACK);
      expect(cleared).toMatch(/^g_state=;/);
    });
  });

  it('survives two simultaneous first sign-ins of the same person without a server error', async () => {
    const callbacks = await Promise.all([signInWithGoogle(profile()), signInWithGoogle(profile())]);

    for (const response of callbacks) {
      expect(response.status).toBe(302);
      expect([WEB_CALLBACK, `${WEB_CALLBACK}?error=GOOGLE_AUTH_FAILED`]).toContain(
        response.headers.location,
      );
    }
    expect(callbacks.some((response) => response.headers.location === WEB_CALLBACK)).toBe(true);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authIdentity.count()).toBe(1);
  });

  it('does not make a Google user an administrator or seller', async () => {
    await createUser(prisma, { email: 'someone-else@example.com' });

    await signInWithGoogle(profile());

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'olena@example.com' } });
    expect(user.roles).toEqual(['CUSTOMER']);
  });
});
