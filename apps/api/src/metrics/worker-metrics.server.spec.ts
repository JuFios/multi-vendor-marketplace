import { Logger } from '@nestjs/common';
import { Counter, register } from '@prometheus-io/client';

import { WorkerMetricsServer } from './worker-metrics.server';

describe('WorkerMetricsServer', () => {
  let server: WorkerMetricsServer;
  let baseUrl: string;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    new Counter({ name: 'app_errors_total', help: 'test', labelNames: ['code'] }).inc({
      code: 'INTERNAL_ERROR',
    });
    server = new WorkerMetricsServer({ workerPort: 0 });
    await server.onApplicationBootstrap();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.onApplicationShutdown();
    register.clear();
    jest.restoreAllMocks();
  });

  it('serves the registry on /metrics', async () => {
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
    const other = new WorkerMetricsServer({ workerPort: 0 });
    await other.onApplicationBootstrap();
    const url = `http://127.0.0.1:${other.port}/metrics`;

    await other.onApplicationShutdown();

    await expect(fetch(url)).rejects.toThrow();
  });
});
