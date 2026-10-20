import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { makeGaugeProvider } from '@willsoto/nestjs-prometheus';

import { OUTBOX_PENDING_EVENTS } from '../metrics/metrics.constants';
import { PrismaService } from '../prisma/prisma.service';

import { OutboxRelay } from './outbox.relay';

const pendingEventsGauge = makeGaugeProvider({
  name: OUTBOX_PENDING_EVENTS,
  help: 'Outbox events not yet published.',
  inject: [PrismaService],
  async collect(prisma: PrismaService) {
    this.set(await prisma.outboxEvent.count({ where: { publishedAt: null } }));
  },
});

/** Worker-only: the api process records events but never relays them. */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [OutboxRelay, pendingEventsGauge],
  exports: [OutboxRelay],
})
export class OutboxRelayModule {}
