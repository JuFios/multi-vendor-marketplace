import type { ModuleMetadata, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { WorkerModule } from '../../src/worker.module';

export interface ProviderOverride {
  token: string | symbol | Type;
  useValue: unknown;
}

export interface TestAppOptions {
  /** Extra modules, e.g. test-only controllers and processors. */
  imports?: ModuleMetadata['imports'];
  /** Run the worker (relay, processors) next to the HTTP app. Default: true. */
  worker?: boolean;
}

let current: NestExpressApplication | undefined;

/** The app most recently created in this spec file; what `flushEvents` waits on by default. */
export function currentTestApp(): NestExpressApplication {
  if (!current) {
    throw new Error('no test app has been created in this spec file');
  }
  return current;
}

/**
 * The HTTP app and the worker module in one process, on the test infrastructure: events recorded
 * by a request are relayed and processed here, and `flushEvents` waits for that to settle.
 */
export async function createTestApp(
  overrides: readonly ProviderOverride[] = [],
  { imports = [], worker = true }: TestAppOptions = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(worker ? [WorkerModule] : []), ...imports],
  });
  for (const { token, useValue } of overrides) {
    builder = builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  try {
    await app.init();
  } catch (error) {
    // A failed start must not leave connections behind that keep the test process alive.
    await app.close();
    throw error;
  }
  current = app;
  return app;
}
