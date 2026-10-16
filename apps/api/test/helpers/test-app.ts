import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface ProviderOverride {
  token: string | symbol;
  useValue: unknown;
}

export async function createTestApp(
  overrides: readonly ProviderOverride[] = [],
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { token, useValue } of overrides) {
    builder = builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
