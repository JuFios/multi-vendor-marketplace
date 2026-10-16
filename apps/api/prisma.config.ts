import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

import { resolveEnvFilePaths } from './src/config/env-files';

// dotenv keeps the first value it sees, so the list is ordered highest priority first.
loadDotenv({ path: resolveEnvFilePaths(), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
