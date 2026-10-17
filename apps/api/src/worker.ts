import { NestFactory } from '@nestjs/core';

import { useAppLogger } from './infrastructure/logger';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  useAppLogger(app);
  app.enableShutdownHooks();
}

void bootstrap();
