import type { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

/** Shared by `main.ts` and the e2e tests so both run the same configured application. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
}
