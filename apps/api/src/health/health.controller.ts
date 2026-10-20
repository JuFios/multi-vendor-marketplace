import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';

import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';

import { DependencyHealthIndicators } from './dependency-health.indicators';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: DependencyHealthIndicators,
  ) {}

  /** Liveness probe; does not touch any dependency. */
  @ApiOperation({ summary: 'Liveness probe' })
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }

  /** Readiness probe; checks Postgres, Redis and Meilisearch. */
  @ApiOperation({ summary: 'Readiness probe: Postgres, Redis and Meilisearch' })
  @ApiOkResponse({ description: 'Every dependency is up.' })
  @ApiErrorResponses(503)
  @Get('ready')
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.dependencies.database(),
      () => this.dependencies.redisConnection(),
      () => this.dependencies.search(),
    ]);
  }
}
