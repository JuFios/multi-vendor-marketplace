import type { ModuleMetadata, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface ProviderOverride {
  token: string | symbol | Type;
  useValue: unknown;
}

/** Boots the api module with the same global setup as the real process. */
export async function createTestApp(
  overrides: readonly ProviderOverride[] = [],
  /** Extra modules, e.g. test-only controllers. */
  imports: ModuleMetadata['imports'] = [],
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule, ...imports] });
  for (const { token, useValue } of overrides) {
    builder = builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
