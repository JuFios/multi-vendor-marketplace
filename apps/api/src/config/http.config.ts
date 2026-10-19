import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const httpConfig = registerAs('http', () => {
  const env = loadEnv();
  return {
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT,
    webOrigin: new URL(env.WEB_URL).origin,
  };
});
