import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';

/** Served at `/metrics`, outside the `/api` prefix (see `configureApp`). */
// Operational scrape target, not part of the public API contract.
@ApiExcludeController()
@SkipThrottle()
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  @Header('Cache-Control', 'no-store')
  override index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
