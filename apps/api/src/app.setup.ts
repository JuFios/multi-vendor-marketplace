import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ClsMiddleware } from 'nestjs-cls';

import { bindRequestCorrelationId, CORRELATION_ID_RESPONSE_HEADER } from './common/correlation';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { useAppLogger } from './infrastructure/logger';
import { createHttpMetricsMiddleware, MetricsService } from './infrastructure/metrics';

export const GLOBAL_PREFIX = 'api';
/** Prometheus scrape path; deliberately outside the `/api` prefix and the public API surface. */
export const METRICS_PATH = 'metrics';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);

  useAppLogger(app);
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: [METRICS_PATH] });

  app.set('trust proxy', config.http.trustProxy);
  // Mounted on the Express instance rather than through ClsModule: module middleware is scoped
  // under the global prefix and would miss `/metrics` and every path outside `/api`.
  app.use(new ClsMiddleware({ setup: bindRequestCorrelationId }).use);
  app.use(createHttpMetricsMiddleware(app.get(MetricsService)));

  app.use(helmet());
  app.enableCors({
    origin: config.web.origin,
    credentials: true,
    exposedHeaders: [CORRELATION_ID_RESPONSE_HEADER],
  });
  app.use(cookieParser());
  app.useBodyParser('json', { limit: config.http.bodyLimit });
  app.useBodyParser('urlencoded', { limit: config.http.bodyLimit, extended: false });
}
