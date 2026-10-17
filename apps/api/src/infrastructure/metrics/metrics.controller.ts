import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { MetricsService } from './metrics.service';

/** Served at `/metrics`, outside the `/api` prefix (see `configureApp`). */
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', MetricsService.CONTENT_TYPE)
  @Header('Cache-Control', 'no-store')
  scrape(): Promise<string> {
    return this.metrics.render();
  }
}
