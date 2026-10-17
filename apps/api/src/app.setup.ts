import type { INestApplication } from '@nestjs/common';

import { useAppLogger } from './infrastructure/logger';

export const GLOBAL_PREFIX = 'api';

export function configureApp(app: INestApplication): void {
  useAppLogger(app);
  app.setGlobalPrefix(GLOBAL_PREFIX);
}
