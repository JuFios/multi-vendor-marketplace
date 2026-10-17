import { Module } from '@nestjs/common';

import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { WorkerMetricsServer } from './infrastructure/metrics';
import { WorkerLifecycle } from './worker-lifecycle';

@Module({ imports: [InfrastructureModule], providers: [WorkerLifecycle, WorkerMetricsServer] })
export class WorkerModule {}
