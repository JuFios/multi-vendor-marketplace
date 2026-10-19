import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { register } from '@prometheus-io/client';
import {
  makeCounterProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

import { HttpMetricsService } from './http-metrics.service';
import {
  APP_ERRORS_TOTAL,
  HTTP_DURATION_BUCKETS_SECONDS,
  HTTP_REQUEST_DURATION_SECONDS,
  HTTP_REQUESTS_TOTAL,
} from './metrics.constants';
import { MetricsController } from './metrics.controller';

const metricProviders = [
  makeCounterProvider({
    name: HTTP_REQUESTS_TOTAL,
    help: 'HTTP requests handled, by method, route template and status code.',
    labelNames: ['method', 'route', 'status'],
  }),
  makeHistogramProvider({
    name: HTTP_REQUEST_DURATION_SECONDS,
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'],
    buckets: HTTP_DURATION_BUCKETS_SECONDS,
  }),
  makeCounterProvider({
    name: APP_ERRORS_TOTAL,
    help: 'Errors turned into an error response, by error code.',
    labelNames: ['code'],
  }),
];

/** Prometheus registry with process metrics; feature modules add their own metric providers. */
@Global()
@Module({
  imports: [PrometheusModule.register({ path: '/metrics', controller: MetricsController })],
  providers: [...metricProviders, HttpMetricsService],
  exports: [...metricProviders, HttpMetricsService],
})
export class MetricsModule implements OnApplicationShutdown {
  // The registry is process-wide; clearing it lets a later application start in the same process.
  onApplicationShutdown(): void {
    register.clear();
  }
}
