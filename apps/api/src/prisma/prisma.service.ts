import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig } from '../config/database.config';
import { PrismaClient } from '../generated/prisma/client';

import { DATABASE_SESSION_OPTIONS } from './session-options';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        options: DATABASE_SESSION_OPTIONS,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
