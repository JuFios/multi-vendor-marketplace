import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  afterEach(() => {
    metrics.onApplicationShutdown();
  });

  it('exposes default process metrics in Prometheus text format', async () => {
    const text = await metrics.render();

    expect(text).toContain('# TYPE process_cpu_user_seconds_total counter');
    expect(metrics.contentType).toBe(MetricsService.CONTENT_TYPE);
  });

  it('records http requests with a status label and a duration observation', async () => {
    metrics.recordHttpRequest({
      method: 'GET',
      route: '/api/health',
      status: 200,
      durationSeconds: 0.02,
    });

    const text = await metrics.render();
    expect(text).toContain('http_requests_total{method="GET",route="/api/health",status="200"} 1');
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/health",status="200"} 1',
    );
  });

  it('counts errors by code', async () => {
    metrics.recordError('VALIDATION_FAILED');
    metrics.recordError('VALIDATION_FAILED');

    expect(await metrics.render()).toContain('app_errors_total{code="VALIDATION_FAILED"} 2');
  });

  it('returns the same metric for a repeated definition', () => {
    const first = metrics.counter({ name: 'jobs_total', help: 'Jobs.' });
    const second = metrics.counter({ name: 'jobs_total', help: 'Jobs.' });

    expect(second).toBe(first);
  });

  it('rejects a name that is already registered as another type', () => {
    metrics.counter({ name: 'jobs_total', help: 'Jobs.' });

    expect(() => metrics.gauge({ name: 'jobs_total', help: 'Jobs.' })).toThrow('different type');
  });

  it('supports gauges and histograms from the factory', async () => {
    metrics
      .gauge({ name: 'queue_waiting_jobs', help: 'Waiting.', labelNames: ['queue'] })
      .set({ queue: 'search' }, 3);
    metrics.histogram({ name: 'job_seconds', help: 'Job time.', buckets: [1] }).observe(0.5);

    const text = await metrics.render();
    expect(text).toContain('queue_waiting_jobs{queue="search"} 3');
    expect(text).toContain('job_seconds_bucket{le="1"} 1');
  });
});
