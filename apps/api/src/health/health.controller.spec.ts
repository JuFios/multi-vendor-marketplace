import type { HealthCheckService } from '@nestjs/terminus';

import type { DependencyHealthIndicators } from './dependency-health.indicators';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController(
    {} as unknown as HealthCheckService,
    {} as unknown as DependencyHealthIndicators,
  );

  it('reports liveness', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
