import type { ConfigType } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ClsMiddleware } from 'nestjs-cls';
import { Logger } from 'nestjs-pino';

import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { bindRequestCorrelationId } from './common/cls/correlation-context';
import { CORRELATION_ID_RESPONSE_HEADER } from './common/cls/correlation-id';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { mountOpenApi } from './common/swagger/openapi';
import { httpConfig } from './config/http.config';
import { createHttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { HttpMetricsService } from './metrics/http-metrics.service';
import { METRICS_PATH } from './metrics/metrics.constants';

export const GLOBAL_PREFIX = 'api';

/** Shared by `main.ts` and the e2e tests so both run the same configured application. */
export function configureApp(app: NestExpressApplication): void {
  const http = app.get<ConfigType<typeof httpConfig>>(httpConfig.KEY);

  app.useLogger(app.get(Logger));
  app.useWebSocketAdapter(new RedisIoAdapter(app));
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: [METRICS_PATH] });
  app.set('trust proxy', http.trustProxy);

  // Mounted on the Express instance rather than through ClsModule or Nest middleware: those are
  // scoped under the global prefix and would miss `/metrics` and every path outside `/api`.
  app.use(new ClsMiddleware({ setup: bindRequestCorrelationId }).use);
  app.use(createHttpMetricsMiddleware(app.get(HttpMetricsService)));

  app.use(helmet());
  app.enableCors({
    origin: http.webOrigin,
    credentials: true,
    exposedHeaders: [CORRELATION_ID_RESPONSE_HEADER],
  });
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  app.useBodyParser('json', { limit: http.bodyLimit });
  app.useBodyParser('urlencoded', { limit: http.bodyLimit, extended: false });
  mountOpenApi(app);
}
