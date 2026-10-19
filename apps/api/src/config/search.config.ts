import { registerAs } from '@nestjs/config';

import { loadEnv } from './env.validation';

export const searchConfig = registerAs('search', () => {
  const env = loadEnv();
  return {
    host: env.MEILI_HOST,
    masterKey: env.MEILI_MASTER_KEY,
    indexPrefix: env.MEILI_INDEX_PREFIX,
  };
});
