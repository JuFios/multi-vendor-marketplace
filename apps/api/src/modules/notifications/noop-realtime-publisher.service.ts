import { Injectable } from '@nestjs/common';

import type { RealtimePublisherPort } from './realtime-publisher.port';

// TODO: realtime publisher
/** Placeholder until live connections exist: notifications are only stored and fetched. */
@Injectable()
export class NoopRealtimePublisher implements RealtimePublisherPort {
  notifyUser(): Promise<void> {
    return Promise.resolve();
  }
}
