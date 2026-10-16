import type { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
}
