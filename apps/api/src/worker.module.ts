import { Module } from '@nestjs/common';

import { WorkerLifecycle } from './worker-lifecycle';

@Module({ providers: [WorkerLifecycle] })
export class WorkerModule {}
