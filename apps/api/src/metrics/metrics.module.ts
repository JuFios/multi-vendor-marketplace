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
  CACHE_HITS_TOTAL,
  CACHE_MISSES_TOTAL,
  CHECKOUT_FAILURES_TOTAL,
  HTTP_DURATION_BUCKETS_SECONDS,
  HTTP_REQUEST_DURATION_SECONDS,
  HTTP_REQUESTS_TOTAL,
  OUTBOX_LAG_BUCKETS_SECONDS,
  OUTBOX_PUBLISH_FAILURES_TOTAL,
  ORDERS_CREATED_TOTAL,
  OUTBOX_PUBLISH_LAG_SECONDS,
  QUEUE_DEAD_LETTER_TOTAL,
  QUEUE_JOB_DURATION_BUCKETS_SECONDS,
  QUEUE_JOB_DURATION_SECONDS,
  QUEUE_JOBS_COMPLETED_TOTAL,
  QUEUE_JOBS_FAILED_TOTAL,
  SEARCH_DEGRADED_TOTAL,
  SELLER_ORDERS_CANCELLED_TOTAL,
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
  makeHistogramProvider({
    name: OUTBOX_PUBLISH_LAG_SECONDS,
    help: 'Time from an event being recorded to it being published.',
    buckets: OUTBOX_LAG_BUCKETS_SECONDS,
  }),
  makeCounterProvider({
    name: OUTBOX_PUBLISH_FAILURES_TOTAL,
    help: 'Failed attempts to publish an outbox event.',
  }),
  makeHistogramProvider({
    name: QUEUE_JOB_DURATION_SECONDS,
    help: 'Time a processor takes to handle one event.',
    labelNames: ['queue', 'event'],
    buckets: QUEUE_JOB_DURATION_BUCKETS_SECONDS,
  }),
  makeCounterProvider({
    name: QUEUE_JOBS_COMPLETED_TOTAL,
    help: 'Jobs processed successfully.',
    labelNames: ['queue', 'event'],
  }),
  makeCounterProvider({
    name: QUEUE_JOBS_FAILED_TOTAL,
    help: 'Failed job attempts, including those that will be retried.',
    labelNames: ['queue', 'event'],
  }),
  makeCounterProvider({
    name: QUEUE_DEAD_LETTER_TOTAL,
    help: 'Jobs that exhausted their retries and now sit in the failed set.',
    labelNames: ['queue'],
  }),
  makeCounterProvider({
    name: CACHE_HITS_TOTAL,
    help: 'Cache reads answered from the cache, by cache.',
    labelNames: ['cache'],
  }),
  makeCounterProvider({
    name: CACHE_MISSES_TOTAL,
    help: 'Cache reads that fell through to the source, by cache.',
    labelNames: ['cache'],
  }),
  makeCounterProvider({
    name: ORDERS_CREATED_TOTAL,
    help: 'Orders created by checkout.',
  }),
  makeCounterProvider({
    name: SELLER_ORDERS_CANCELLED_TOTAL,
    help: 'Seller orders cancelled, by who cancelled them.',
    labelNames: ['actor'],
  }),
  makeCounterProvider({
    name: CHECKOUT_FAILURES_TOTAL,
    help: 'Checkouts that failed, by error code.',
    labelNames: ['reason'],
  }),
  makeCounterProvider({
    name: SEARCH_DEGRADED_TOTAL,
    help: 'Catalog requests answered from the SQL fallback because the search index failed.',
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
