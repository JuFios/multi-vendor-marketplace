import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface ProviderOverride {
  token: string | symbol;
  useValue: unknown;
}

export type TestApp = NestExpressApplication;

/** Boots the given module metadata with the same global setup as the real api. */
export async function createTestAppFrom(
  metadata: ModuleMetadata,
  overrides: readonly ProviderOverride[] = [],
): Promise<TestApp> {
  let builder = Test.createTestingModule(metadata);
  for (const { token, useValue } of overrides) {
    builder = builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<TestApp>();
  configureApp(app);
  await app.init();
  return app;
}

export function createTestApp(overrides: readonly ProviderOverride[] = []): Promise<TestApp> {
  return createTestAppFrom({ imports: [AppModule] }, overrides);
}
