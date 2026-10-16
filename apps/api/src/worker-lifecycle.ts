import { APP_NAME } from '@marketplace/shared';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

const KEEP_ALIVE_INTERVAL_MS = 60_000;

/**
 * Keeps the worker process alive until a shutdown signal arrives; queue
 * consumers and schedulers replace this once they exist.
 */
@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Worker');
  private keepAlive: NodeJS.Timeout | undefined;

  onApplicationBootstrap(): void {
    this.keepAlive = setInterval(() => undefined, KEEP_ALIVE_INTERVAL_MS);
    this.logger.log(`worker started (${APP_NAME})`);
  }

  onModuleDestroy(): void {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = undefined;
    }
    this.logger.log('worker stopped');
  }
}
