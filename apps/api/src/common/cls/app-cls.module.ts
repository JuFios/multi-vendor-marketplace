import { Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsModule } from 'nestjs-cls';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

type PluginAdapter = ConstructorParameters<typeof ClsPluginTransactional>[0]['adapter'];

// The adapter declares optional members as `T | undefined`, which exactOptionalPropertyTypes rejects.
const prismaTransactionalAdapter = new TransactionalAdapterPrisma<PrismaService>({
  prismaInjectionToken: PrismaService,
  sqlFlavor: 'postgresql',
}) as unknown as PluginAdapter;

/** Request-scoped context (CLS) with transactions that propagate across services and repositories. */
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: prismaTransactionalAdapter,
        }),
      ],
    }),
  ],
})
export class AppClsModule {}
