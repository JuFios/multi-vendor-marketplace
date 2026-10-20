import { Global, Module } from '@nestjs/common';

import { EVENT_ROUTES, EVENT_ROUTING } from './events/event-routes';
import { OutboxService } from './outbox.service';

/** Recording events and the routing table; available to the api and to the worker alike. */
@Global()
@Module({
  providers: [OutboxService, { provide: EVENT_ROUTING, useValue: EVENT_ROUTES }],
  exports: [OutboxService, EVENT_ROUTING],
})
export class OutboxModule {}
