import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { register } from '@prometheus-io/client';

import { metricsConfig } from '../config/metrics.config';

const SCRAPE_PATH = '/metrics';

/** The worker serves no API, so Prometheus scrapes it on a port of its own. */
@Injectable()
export class WorkerMetricsServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('WorkerMetrics');
  private readonly server: Server = createServer((req, res) => {
    void this.handle(req.method, req.url, res);
  });

  constructor(
    @Inject(metricsConfig.KEY) private readonly config: ConfigType<typeof metricsConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.workerPort, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.logger.log(`worker metrics listening on port ${this.port}`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.server.listening) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
      this.server.closeAllConnections();
    });
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  private async handle(
    method: string | undefined,
    url: string | undefined,
    res: ServerResponse,
  ): Promise<void> {
    const path = url?.split('?')[0];
    if (method !== 'GET' || path !== SCRAPE_PATH) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (error) {
      this.logger.error(`failed to render metrics: ${String(error)}`);
      res.writeHead(500).end();
    }
  }
}
