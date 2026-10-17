import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { ApiErrorResponses } from '../infrastructure/openapi';

import { DependencyHealthIndicators } from './dependency-health.indicators';

export interface HealthResponse {
  status: 'ok';
}

// Probes must keep answering even when Redis (the throttle store) is down.
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: DependencyHealthIndicators,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe; does not touch any dependency.' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
  })
  check(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiErrorResponses(503)
  // Terminus' own 503 docs describe a body the uniform error filter no longer returns.
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Readiness probe; checks Postgres, Redis and Meilisearch.' })
  @ApiOkResponse({ description: 'Every dependency is up.' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.dependencies.database(),
      () => this.dependencies.redisConnection(),
      () => this.dependencies.search(),
    ]);
  }
}
