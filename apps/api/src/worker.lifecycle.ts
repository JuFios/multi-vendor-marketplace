import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

const KEEP_ALIVE_INTERVAL_MS = 60_000;

/**
 * Logs the worker's start and stop, and keeps the process alive while no queue worker or
 * scheduler holds the event loop open.
 */
@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Worker');
  private keepAlive: NodeJS.Timeout | undefined;

  onApplicationBootstrap(): void {
    this.keepAlive = setInterval(() => undefined, KEEP_ALIVE_INTERVAL_MS);
    this.logger.log('worker started');
  }

  onModuleDestroy(): void {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = undefined;
    }
    this.logger.log('worker stopped');
  }
}
