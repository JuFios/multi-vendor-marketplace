import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const appConfig = registerAs('app', () => {
  const env = loadEnv();
  return { env: env.NODE_ENV, port: env.PORT };
});
