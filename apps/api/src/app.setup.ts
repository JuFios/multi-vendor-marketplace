import type { INestApplication } from '@nestjs/common';
import { ClsMiddleware } from 'nestjs-cls';

import { bindRequestCorrelationId } from './common/correlation';
import { useAppLogger } from './infrastructure/logger';
import { createHttpMetricsMiddleware, MetricsService } from './infrastructure/metrics';

export const GLOBAL_PREFIX = 'api';
/** Prometheus scrape path; deliberately outside the `/api` prefix and the public API surface. */
export const METRICS_PATH = 'metrics';

export function configureApp(app: INestApplication): void {
  useAppLogger(app);
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: [METRICS_PATH] });
  // Mounted on the Express instance rather than through ClsModule: module middleware is scoped
  // under the global prefix and would miss `/metrics` and every path outside `/api`.
  app.use(new ClsMiddleware({ setup: bindRequestCorrelationId }).use);
  app.use(createHttpMetricsMiddleware(app.get(MetricsService)));
}
