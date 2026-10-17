import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { MetricsHttpModule } from './infrastructure/metrics';
import { ThrottlingModule } from './infrastructure/throttling';

@Module({ imports: [InfrastructureModule, ThrottlingModule, MetricsHttpModule, HealthModule] })
export class AppModule {}
