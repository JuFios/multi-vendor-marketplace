import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { overrideEnv } from '../utils/env';
import { createTestApp } from '../utils/test-app';

// Uses the real strategy: building the authorization URL needs no network.
describe('Google authorization redirect with the real strategy (e2e)', () => {
  let app: NestExpressApplication;
  let restoreEnv: () => void;

  beforeAll(async () => {
    restoreEnv = overrideEnv({
      GOOGLE_CLIENT_ID: 'real-client-id',
      GOOGLE_CLIENT_SECRET: 'real-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
    });
    app = await createTestApp([], { worker: false });
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  it('sends the browser to Google with the client, scope, callback and state', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/google').expect(302);
    const location = new URL(response.headers.location!);
    const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];

    expect(`${location.origin}${location.pathname}`).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('client_id')).toBe('real-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/api/auth/google/callback',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email', 'profile']),
    );
    expect(cookies.some((c) => c.startsWith(`g_state=${location.searchParams.get('state')}`))).toBe(
      true,
    );
  });
});
