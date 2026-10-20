import { Module } from '@nestjs/common';

import { NotificationsModule } from './notifications.module';
import { NotificationsProcessor } from './notifications.processor';
import { RealtimeProcessor } from './realtime.processor';

/** The notifications and realtime queue consumers; registered in the worker process only. */
@Module({ imports: [NotificationsModule], providers: [NotificationsProcessor, RealtimeProcessor] })
export class NotificationsWorkerModule {}
