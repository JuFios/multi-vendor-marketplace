import { Prisma, type PrismaClient } from '../../src/generated/prisma/client';

/** Empties every table except Prisma's migration history, so each spec starts clean. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) {
    return;
  }
  const names = Prisma.join(tables.map(({ tablename }) => Prisma.raw(`"${tablename}"`)));
  await prisma.$executeRaw`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`;
}
