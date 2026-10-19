import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { DATABASE_SESSION_OPTIONS } from '../src/prisma/session-options';

import { runSeed } from './seed/run-seed';
import { parseSeedEnv } from './seed/seed-env';

async function main(): Promise<void> {
  const env = parseSeedEnv(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      options: DATABASE_SESSION_OPTIONS,
    }),
  });
  try {
    await runSeed(prisma, env);
    console.log('seed: done');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
