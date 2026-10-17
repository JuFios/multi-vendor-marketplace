import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from '@prometheus-io/client';

const DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export interface HttpRequestSample {
  method: string;
  route: string;
  status: number;
  durationSeconds: number;
}

/**
 * Owns the process-wide registry. Feature modules obtain their metrics through the
 * `counter`/`gauge`/`histogram` factories, so a metric is defined once and shared by name.
 */
@Injectable()
export class MetricsService implements OnApplicationShutdown {
  /** Same value as `registry.contentType`; a constant so decorators can use it. */
  static readonly CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

  readonly registry = new Registry();

  private readonly httpRequests = this.counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by method, route template and status code.',
    labelNames: ['method', 'route', 'status'],
  });
  private readonly httpDuration = this.histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'],
    buckets: DURATION_BUCKETS_SECONDS,
  });
  private readonly appErrors = this.counter({
    name: 'app_errors_total',
    help: 'Errors turned into an error response, by error code.',
    labelNames: ['code'],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  counter<Label extends string = string>(config: CounterConfiguration<Label>): Counter<Label> {
    return this.getOrCreate(config, Counter);
  }

  gauge<Label extends string = string>(config: GaugeConfiguration<Label>): Gauge<Label> {
    return this.getOrCreate(config, Gauge);
  }

  histogram<Label extends string = string>(
    config: HistogramConfiguration<Label>,
  ): Histogram<Label> {
    return this.getOrCreate(config, Histogram);
  }

  recordHttpRequest({ method, route, status, durationSeconds }: HttpRequestSample): void {
    const labels = { method, route, status: String(status) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  recordError(code: string): void {
    this.appErrors.inc({ code });
  }

  /** Prometheus text exposition of everything registered. */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  onApplicationShutdown(): void {
    this.registry.clear();
  }

  private getOrCreate<Config extends { name: string }, Metric extends object>(
    config: Config,
    type: new (config: Config & { registers: Registry[] }) => Metric,
  ): Metric {
    const existing = this.registry.getSingleMetric(config.name);
    if (existing instanceof type) {
      return existing;
    }
    if (existing) {
      throw new Error(`metric "${config.name}" is already registered with a different type`);
    }
    return new type({ ...config, registers: [this.registry] });
  }
}
