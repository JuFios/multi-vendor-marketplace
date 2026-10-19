import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { overrideEnv } from './utils/env';
import { createTestApp } from './utils/test-app';

describe('Google sign-in without credentials (e2e)', () => {
  let app: NestExpressApplication;
  let restoreEnv: () => void;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_CALLBACK_URL: '',
    });
    app = await createTestApp([], { worker: false });
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('reports Google as off to the frontend', async () => {
    const response = await http().get('/api/auth/providers').expect(200);

    expect(response.body).toEqual({ google: false });
  });

  it.each(['/api/auth/google', '/api/auth/google/callback?code=x&state=y'])(
    'answers 503 PROVIDER_DISABLED on %s',
    async (path) => {
      const response = await http().get(path);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'PROVIDER_DISABLED' } });
    },
  );

  it('keeps password sign-in working', async () => {
    await http()
      .post('/api/auth/register')
      .send({ email: 'plain@example.com', password: 'correct-horse-1', name: 'Plain' })
      .expect(201);
  });
});
