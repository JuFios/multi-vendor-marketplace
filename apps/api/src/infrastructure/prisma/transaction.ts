import type { TransactionHost, TransactionalAdapter } from '@nestjs-cls/transactional';

import type { Prisma } from '../../generated/prisma/client';

import type { PrismaService } from './prisma.service';

/**
 * Injected by repositories: `txHost.tx` is the ambient transaction, or the plain client outside one.
 * Spelled out because the adapter derives the transaction client from `@prisma/client`, which the
 * `prisma-client` generator does not produce.
 */
export type AppTransactionHost = TransactionHost<
  TransactionalAdapter<PrismaService, Prisma.TransactionClient, unknown>
>;
