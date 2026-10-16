import { Module } from '@nestjs/common';

import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { WorkerLifecycle } from './worker-lifecycle';

@Module({ imports: [InfrastructureModule], providers: [WorkerLifecycle] })
export class WorkerModule {}
