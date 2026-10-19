import { Module } from '@nestjs/common';

import { AppConfigModule } from './config';
import { WorkerLifecycle } from './worker.lifecycle';

@Module({
  imports: [AppConfigModule],
  providers: [WorkerLifecycle],
})
export class WorkerModule {}
