import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { CacheModule } from '../cache';
import { AppClsModule } from '../common/cls/app-cls.module';
import { AppConfigModule } from '../config';
import { LoggerModule } from '../logger';
import { MetricsModule } from '../metrics';
import { SearchIndexModule } from '../modules/search-sync/search-index.module';
import { SearchIndexer } from '../modules/search-sync/search-indexer.service';
import { OutboxModule } from '../outbox';
import { PrismaModule } from '../prisma';
import { RedisModule } from '../redis';
import { MeiliModule } from '../search';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MetricsModule,
    PrismaModule,
    AppClsModule,
    OutboxModule,
    CacheModule,
    RedisModule,
    MeiliModule,
    SearchIndexModule,
  ],
})
class SearchReindexModule {}

/** Rebuilds the whole search index from the database: drops every document, then re-adds. */
async function reindex(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SearchReindexModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    await app.get(SearchIndexer).reindexAll({ clear: true });
  } finally {
    await app.close();
  }
}

reindex().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
