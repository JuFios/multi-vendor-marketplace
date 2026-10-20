import { createHash } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { argon2id, hash } from 'argon2';
import request from 'supertest';

import { runSeed } from '../../prisma/seed/run-seed';
import { parseSeedEnv } from '../../prisma/seed/seed-env';
import { loadEnvFiles } from '../../src/config/env-files';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cookieValue, refreshCookieOf } from '../utils/auth';
import { resetDb } from '../utils/db';
import { overrideEnv } from '../utils/env';
import { createUser } from '../utils/factories';
import { createTestApp } from '../utils/test-app';
import { resetThrottleCounters } from '../utils/throttle';

loadEnvFiles();

interface SessionBody {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string; name: string; roles: string[]; emailVerified: boolean };
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; messages: string[] }[] };
}

const PASSWORD = 'correct-horse-1';

describe('Register and login (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;

  const http = () => request(app.getHttpServer());
  const register = (body: object) => http().post('/api/auth/register').send(body);
  const login = (body: object) => http().post('/api/auth/login').send(body);

  beforeAll(async () => {
    restoreEnv = overrideEnv({ THROTTLE_LOGIN_LIMIT: '1000', THROTTLE_REGISTER_LIMIT: '1000' });
    app = await createTestApp([], { worker: false });
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

  describe('POST /api/auth/register', () => {
    it('creates a customer, returns an access token and sets the refresh cookie', async () => {
      const response = await register({
        email: 'New.Buyer@Example.com',
        password: PASSWORD,
        name: 'New Buyer',
      }).expect(201);
      const body = response.body as SessionBody;

      expect(body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { email: 'new.buyer@example.com', name: 'New Buyer', roles: ['CUSTOMER'] },
      });
      expect(body.user.emailVerified).toBe(false);
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);

      await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });

    it('sets a refresh cookie that is httpOnly, Lax and scoped to /api/auth', async () => {
      const response = await register({ email: 'c@example.com', password: PASSWORD, name: 'C' });
      const cookie = refreshCookieOf(response);

      expect(cookie).toMatch(/^rt=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).toMatch(/Expires=/);
      // Only production sets Secure; the test profile is plain http.
      expect(cookie).not.toContain('Secure');
    });

    it('keeps the access token out of cookies and headers', async () => {
      const response = await register({ email: 'd@example.com', password: PASSWORD, name: 'D' });
      const { accessToken } = response.body as SessionBody;

      expect(JSON.stringify(response.headers)).not.toContain(accessToken);
    });

    it('stores an argon2id password hash and only the hash of the refresh token', async () => {
      const response = await register({ email: 'e@example.com', password: PASSWORD, name: 'E' });
      const token = cookieValue(refreshCookieOf(response));

      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'e@example.com' } });
      const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });

      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
      expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.revokedAt).toBeNull();
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    });

    it('rejects a duplicate email regardless of case', async () => {
      await register({ email: 'dup@example.com', password: PASSWORD, name: 'First' }).expect(201);

      const response = await register({
        email: 'DUP@example.com',
        password: PASSWORD,
        name: 'Second',
      });

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it.each([
      ['a short password', { password: 'abc123' }, 'password'],
      ['a password without a digit', { password: 'abcdefghij' }, 'password'],
      ['a password without a letter', { password: '1234567890' }, 'password'],
      ['an invalid email', { email: 'not-an-email' }, 'email'],
      ['an empty name', { name: '   ' }, 'name'],
    ])('rejects %s', async (_label, override, field) => {
      const response = await register({
        email: 'v@example.com',
        password: PASSWORD,
        name: 'V',
        ...override,
      });
      const { error } = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details?.map((issue) => issue.field)).toEqual([field]);
    });

    it('does not accept roles or other unknown fields', async () => {
      await register({
        email: 'r@example.com',
        password: PASSWORD,
        name: 'R',
        roles: ['ADMIN'],
      }).expect(400);
      expect(await prisma.user.count()).toBe(0);
    });

    it('strips markup from the name', async () => {
      const response = await register({
        email: 'x@example.com',
        password: PASSWORD,
        name: '<script>alert(1)</script>Olena',
      }).expect(201);

      expect((response.body as SessionBody).user.name).toBe('Olena');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await register({ email: 'buyer@example.com', password: PASSWORD, name: 'Buyer' }).expect(201);
    });

    it('signs in with the right password, ignoring email case', async () => {
      const response = await login({ email: 'BUYER@example.com', password: PASSWORD }).expect(200);
      const body = response.body as SessionBody;

      expect(body.user.email).toBe('buyer@example.com');
      expect(refreshCookieOf(response)).toContain('HttpOnly');
      await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });

    it('starts a separate refresh-token family for every sign-in', async () => {
      await login({ email: 'buyer@example.com', password: PASSWORD }).expect(200);
      await login({ email: 'buyer@example.com', password: PASSWORD }).expect(200);

      const families = await prisma.refreshToken.findMany({ select: { familyId: true } });

      expect(new Set(families.map(({ familyId }) => familyId)).size).toBe(3);
    });

    it('answers the same way for a wrong password and an unknown email', async () => {
      const wrong = await login({ email: 'buyer@example.com', password: 'wrong-pass-1' });
      const unknown = await login({ email: 'nobody@example.com', password: PASSWORD });

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((wrong.body as ErrorBody).error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      const wrongError = (wrong.body as ErrorBody).error;
      const unknownError = (unknown.body as ErrorBody).error;
      expect({ code: unknownError.code, message: unknownError.message }).toEqual({
        code: wrongError.code,
        message: wrongError.message,
      });
      expect(wrong.headers['set-cookie']).toBeUndefined();
    });

    it('does not let an account without a password sign in', async () => {
      await createUser(prisma, { email: 'google-only@example.com', passwordHash: null });

      const response = await login({ email: 'google-only@example.com', password: PASSWORD });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe('INVALID_CREDENTIALS');
    });

    it('verifies a password hashed the way the seed hashes it', async () => {
      await createUser(prisma, {
        email: 'seeded@example.com',
        passwordHash: await hash('demo-password-1', { type: argon2id }),
      });

      await login({ email: 'seeded@example.com', password: 'demo-password-1' }).expect(200);
    });

    it('rejects a malformed body', async () => {
      await login({ email: 'buyer@example.com' }).expect(400);
      await login({ email: 'buyer@example.com', password: 'x'.repeat(500) }).expect(400);
    });
  });

  describe('seeded demo accounts', () => {
    it('can sign in with the seed passwords', async () => {
      const env = parseSeedEnv(process.env);
      await runSeed(prisma, env);

      const admin = await login({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }).expect(
        200,
      );
      const buyer = await login({
        email: 'buyer1@example.com',
        password: env.SEED_DEMO_PASSWORD,
      }).expect(200);
      const seller = await login({
        email: 'seller1@example.com',
        password: env.SEED_DEMO_PASSWORD,
      }).expect(200);

      expect((admin.body as SessionBody).user.roles).toContain('ADMIN');
      expect((buyer.body as SessionBody).user.roles).toEqual(['CUSTOMER']);
      expect((seller.body as SessionBody).user.roles).toContain('SELLER');
    });
  });
});
