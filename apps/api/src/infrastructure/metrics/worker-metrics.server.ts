import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';

import { MetricsService } from './metrics.service';

const METRICS_PATH = '/metrics';

/** The worker serves no API, so Prometheus scrapes it on a port of its own. */
@Injectable()
export class WorkerMetricsServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('WorkerMetrics');
  private readonly server: Server = createServer((req, res) => {
    void this.handle(req.method, req.url, res);
  });

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly metrics: MetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.metrics.workerPort, () => {
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
    if (method !== 'GET' || path !== METRICS_PATH) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await this.metrics.render();
      res.writeHead(200, { 'Content-Type': this.metrics.contentType, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (error) {
      this.logger.error(`failed to render metrics: ${String(error)}`);
      res.writeHead(500).end();
    }
  }
}
