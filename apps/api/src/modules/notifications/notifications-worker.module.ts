import { Module } from '@nestjs/common';

import { NotificationsModule } from './notifications.module';
import { NotificationsProcessor } from './notifications.processor';

/** The notifications queue consumer; registered in the worker process only. */
@Module({ imports: [NotificationsModule], providers: [NotificationsProcessor] })
export class NotificationsWorkerModule {}
