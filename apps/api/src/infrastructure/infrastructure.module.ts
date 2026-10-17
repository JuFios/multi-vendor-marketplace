import { Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsModule } from 'nestjs-cls';

import { AppConfigModule } from '../config/app-config.module';

import { ErrorsModule } from './errors';
import { LoggingModule } from './logger';
import { MetricsModule } from './metrics';
import { PrismaModule, PrismaService } from './prisma';
import { RedisModule } from './redis';
import { MeiliModule } from './search';

type PluginAdapter = ConstructorParameters<typeof ClsPluginTransactional>[0]['adapter'];

// The adapter declares optional members as `T | undefined`, which exactOptionalPropertyTypes rejects.
const prismaTransactionalAdapter = new TransactionalAdapterPrisma<PrismaService>({
  prismaInjectionToken: PrismaService,
  sqlFlavor: 'postgresql',
}) as unknown as PluginAdapter;

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    MetricsModule,
    ErrorsModule,
    PrismaModule,
    RedisModule,
    MeiliModule,
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
export class InfrastructureModule {}
