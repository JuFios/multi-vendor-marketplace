import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../app.module';
import { GLOBAL_PREFIX, METRICS_PATH } from '../app.setup';
import { createOpenApiDocument } from '../infrastructure/openapi';

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
  writeFileSync(join(process.cwd(), OUTPUT_FILE), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
