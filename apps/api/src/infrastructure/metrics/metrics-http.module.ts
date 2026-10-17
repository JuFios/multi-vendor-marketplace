import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';

/** Exposes `/metrics` in the api process; the worker has its own server. */
@Module({ controllers: [MetricsController] })
export class MetricsHttpModule {}
