import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';

import { DependencyHealthIndicators } from './dependency-health.indicators';

export interface HealthResponse {
  status: 'ok';
}

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: DependencyHealthIndicators,
  ) {}

  /** Liveness probe; does not touch any dependency. */
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiErrorResponses(500)
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }

  /** Readiness gate: Postgres and Redis. The search index is reported but never gates readiness. */
  @ApiOperation({ summary: 'Readiness probe: Postgres and Redis, search index reported' })
  @ApiOkResponse({ description: 'Every gating dependency is up.' })
  @ApiErrorResponses(503)
  @Get('ready')
  async ready(): Promise<HealthCheckResult> {
    const [core, search] = await Promise.all([
      this.health.check([
        () => this.dependencies.database(),
        () => this.dependencies.redisConnection(),
      ]),
      this.dependencies.search(),
    ]);
    return { ...core, details: { ...core.details, ...search } };
  }
}
