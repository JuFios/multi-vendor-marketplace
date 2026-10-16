import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';

import { DependencyHealthIndicators } from './dependency-health.indicators';

export interface HealthResponse {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: DependencyHealthIndicators,
  ) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.dependencies.database(),
      () => this.dependencies.redisConnection(),
      () => this.dependencies.search(),
    ]);
  }
}
