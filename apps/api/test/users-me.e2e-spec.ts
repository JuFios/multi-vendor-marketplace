import { Controller, Get, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { Public } from '../src/common/decorators';
import { Roles } from '../src/modules/auth';
import { PrismaService } from '../src/prisma';

import { bearerFor } from './utils/auth';
import { resetDb } from './utils/db';
import { createUser } from './utils/factories';
import { createTestApp } from './utils/test-app';

interface ResponseBody {
  error: { code: string; correlationId: string };
  name: string;
}

@Controller('guard-spec')
class GuardSpecController {
  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('any')
  any(): { ok: true } {
    return { ok: true };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [GuardSpecController] })
class GuardSpecModule {}

describe('Authentication guards and /users/me (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp([], { imports: [GuardSpecModule], worker: false });
    prisma = app.get(PrismaService);
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('route protection', () => {
    it('serves @Public() routes, health and metrics without a token', async () => {
      await http().get('/api/guard-spec/open').expect(200);
      await http().get('/api/health').expect(200);
      await http().get('/metrics').expect(200);
    });

    it('rejects a protected route without a token as UNAUTHORIZED', async () => {
      const body = (await http().get('/api/guard-spec/any').expect(401)).body as ResponseBody;

      expect(body.error).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(body.error.correlationId).toEqual(expect.any(String));
    });

    it('rejects a malformed, foreign or non-bearer token', async () => {
      await http().get('/api/guard-spec/any').set('Authorization', 'Bearer nonsense').expect(401);
      await http()
        .get('/api/guard-spec/any')
        .set('Authorization', 'Basic dXNlcjpwdw==')
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const user = await createUser(prisma);
      const expired = await app
        .get(JwtService, { strict: false })
        .signAsync({ roles: ['CUSTOMER'] }, { subject: user.id, expiresIn: -10 });

      await http().get('/api/guard-spec/any').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it.each([
      ['signed with another secret', 'HS256', 'another-secret-also-32-characters-long', true],
      ['signed with another algorithm', 'HS512', undefined, true],
      ['without roles', 'HS256', undefined, false],
    ])('rejects a token %s', async (_label, algorithm, secret, withRoles) => {
      const user = await createUser(prisma);
      const jwt =
        secret === undefined ? app.get(JwtService, { strict: false }) : new JwtService({ secret });
      const token = await jwt.signAsync(withRoles ? { roles: ['ADMIN'] } : {}, {
        subject: user.id,
        algorithm: algorithm as 'HS256' | 'HS512',
      });

      await http().get('/api/users/me').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('rejects an unsigned token', async () => {
      const user = await createUser(prisma);
      const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: user.id, roles: ['ADMIN'] })}.`;

      await http().get('/api/users/me').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('accepts a valid token', async () => {
      const user = await createUser(prisma);

      await http()
        .get('/api/guard-spec/any')
        .set('Authorization', await bearerFor(app, user))
        .expect(200);
    });

    it('answers 404 for an unknown route even without a token', async () => {
      await http().get('/api/no-such-route').expect(404);
    });
  });

  describe('roles', () => {
    it('forbids a customer on an ADMIN route and allows an admin', async () => {
      const customer = await createUser(prisma);
      const admin = await createUser(prisma, { roles: ['CUSTOMER', 'ADMIN'] });

      const body = (
        await http()
          .get('/api/guard-spec/admin')
          .set('Authorization', await bearerFor(app, customer))
          .expect(403)
      ).body as ResponseBody;
      expect(body.error.code).toBe('FORBIDDEN');
      await http()
        .get('/api/guard-spec/admin')
        .set('Authorization', await bearerFor(app, admin))
        .expect(200);
    });
  });

  describe('GET/PATCH /api/users/me', () => {
    it('requires authentication', async () => {
      await http().get('/api/users/me').expect(401);
      await http().patch('/api/users/me').send({ name: 'X' }).expect(401);
    });

    it('returns the profile without secrets', async () => {
      const user = await createUser(prisma, { name: 'Olena', passwordHash: '$argon2id$secret' });

      const body = (
        await http()
          .get('/api/users/me')
          .set('Authorization', await bearerFor(app, user))
          .expect(200)
      ).body as ResponseBody;

      expect(body).toEqual({
        id: user.id,
        email: user.email,
        name: 'Olena',
        roles: ['CUSTOMER'],
        emailVerified: false,
        createdAt: user.createdAt.toISOString(),
      });
    });

    it('updates the name, trimmed and stripped of markup', async () => {
      const user = await createUser(prisma);
      const auth = await bearerFor(app, user);

      const body = (
        await http()
          .patch('/api/users/me')
          .set('Authorization', auth)
          .send({ name: '  <b>Ivan</b> Petrenko  ' })
          .expect(200)
      ).body as ResponseBody;

      expect(body.name).toBe('Ivan Petrenko');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
        'Ivan Petrenko',
      );
    });

    it('rejects an empty name and fields that cannot be changed', async () => {
      const user = await createUser(prisma);
      const auth = await bearerFor(app, user);

      await http()
        .patch('/api/users/me')
        .set('Authorization', auth)
        .send({ name: '   ' })
        .expect(400);
      const body = (
        await http()
          .patch('/api/users/me')
          .set('Authorization', auth)
          .send({ name: 'Ok', roles: ['ADMIN'] })
          .expect(400)
      ).body as ResponseBody;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('does not take roles from the request: a customer token stays a customer', async () => {
      const user = await createUser(prisma);

      await http()
        .patch('/api/users/me')
        .set('Authorization', await bearerFor(app, user))
        .send({ name: 'Ok', roles: ['ADMIN'] })
        .expect(400);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).roles).toEqual([
        'CUSTOMER',
      ]);
    });

    it('answers USER_NOT_FOUND for a valid token of a deleted user', async () => {
      const user = await createUser(prisma);
      const auth = await bearerFor(app, user);
      await prisma.user.delete({ where: { id: user.id } });

      const body = (await http().get('/api/users/me').set('Authorization', auth).expect(404))
        .body as ResponseBody;

      expect(body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});
