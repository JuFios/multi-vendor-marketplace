import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../app.module';
import { GLOBAL_PREFIX } from '../app.setup';
import { createOpenApiDocument } from '../common/swagger/openapi';
import { METRICS_PATH } from '../metrics/metrics.constants';

// Run from apps/api (npm workspace): the spec is published at the repository root.
const OUTPUT_DIR = join(process.cwd(), '..', '..', 'docs', 'api');
const OUTPUT_FILE = 'openapi.json';

async function exportOpenApi(): Promise<void> {
  // Preview mode builds the route graph without connecting to Postgres, Redis or Meilisearch.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    preview: true,
    logger: ['error'],
    abortOnError: false,
  });
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: [METRICS_PATH] });
  const document = createOpenApiDocument(app);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, OUTPUT_FILE), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
