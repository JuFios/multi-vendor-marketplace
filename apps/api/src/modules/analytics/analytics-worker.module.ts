import { Module } from '@nestjs/common';

import { AnalyticsModule } from './analytics.module';
import { AnalyticsProcessor } from './analytics.processor';

/** The analytics queue consumer; registered in the worker process only. */
@Module({ imports: [AnalyticsModule], providers: [AnalyticsProcessor] })
export class AnalyticsWorkerModule {}
