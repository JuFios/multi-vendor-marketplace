import { PrismaPg } from '@prisma/adapter-pg';

import { loadEnvFiles } from '../src/config/env-files';
import { PrismaClient } from '../src/generated/prisma/client';
import { DATABASE_SESSION_OPTIONS } from '../src/prisma/session-options';

import { runHistorySeed } from './seed/run-history';
import { parseSeedEnv } from './seed/seed-env';

async function main(): Promise<void> {
  // `prisma db seed` loads the env files itself; this script runs without the Prisma CLI.
  loadEnvFiles();
  const env = parseSeedEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      options: DATABASE_SESSION_OPTIONS,
    }),
  });
  try {
    const result = await runHistorySeed(prisma, env);
    console.log(
      `seed:history: added ${result.orders} orders and ${result.abandonedCarts} abandoned carts`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
