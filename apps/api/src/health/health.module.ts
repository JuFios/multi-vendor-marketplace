import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DependencyHealthIndicators } from './dependency-health.indicators';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DependencyHealthIndicators],
})
export class HealthModule {}
