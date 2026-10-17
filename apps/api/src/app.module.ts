import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { MetricsHttpModule } from './infrastructure/metrics';

@Module({ imports: [InfrastructureModule, MetricsHttpModule, HealthModule] })
export class AppModule {}
