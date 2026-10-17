import { Logger } from '@nestjs/common';

import type { AppConfig } from '../../config/app-config';

import { MetricsService } from './metrics.service';
import { WorkerMetricsServer } from './worker-metrics.server';

describe('WorkerMetricsServer', () => {
  let metrics: MetricsService;
  let server: WorkerMetricsServer;
  let baseUrl: string;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    metrics = new MetricsService();
    server = new WorkerMetricsServer({ metrics: { workerPort: 0 } } as AppConfig, metrics);
    await server.onApplicationBootstrap();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.onApplicationShutdown();
    metrics.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('serves the registry on /metrics', async () => {
    metrics.recordError('INTERNAL_ERROR');

    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('app_errors_total{code="INTERNAL_ERROR"} 1');
  });

  it('answers 404 for anything else', async () => {
    expect((await fetch(`${baseUrl}/`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/metrics`, { method: 'POST' })).status).toBe(404);
  });

  it('stops listening on shutdown', async () => {
    const other = new WorkerMetricsServer({ metrics: { workerPort: 0 } } as AppConfig, metrics);
    await other.onApplicationBootstrap();
    const url = `http://127.0.0.1:${other.port}/metrics`;

    await other.onApplicationShutdown();

    await expect(fetch(url)).rejects.toThrow();
  });
});
