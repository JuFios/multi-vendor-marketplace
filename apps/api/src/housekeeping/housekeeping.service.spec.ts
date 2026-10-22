import type { ConfigType } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { Counter } from '@prometheus-io/client';

import type { housekeepingConfig } from '../config/housekeeping.config';
import type { PrismaService } from '../prisma/prisma.service';

import { HousekeepingService } from './housekeeping.service';

/** Intervals the services registered; cleared after each test so none keeps jest alive. */
const timers: NodeJS.Timeout[] = [];

function setup() {
  const prisma = { $executeRaw: jest.fn().mockResolvedValue(0) };
  const scheduler = {
    addInterval: jest.fn((_name: string, timer: NodeJS.Timeout) => timers.push(timer)),
  };
  const config: ConfigType<typeof housekeepingConfig> = {
    intervalMs: 600_000,
    batchSize: 5000,
    outboxRetentionDays: 7,
    processedEventsRetentionDays: 14,
  };
  const service = new HousekeepingService(
    config,
    prisma as unknown as PrismaService,
    scheduler as unknown as SchedulerRegistry,
    { inc: jest.fn() } as unknown as Counter<'table'>,
  );
  return { service, prisma, scheduler };
}

describe('HousekeepingService', () => {
  afterEach(() => {
    timers.splice(0).forEach(clearInterval);
  });

  it('sweeps every table as soon as the worker starts, not only after the first interval', async () => {
    const { service, prisma, scheduler } = setup();

    service.onApplicationBootstrap();
    // Joins the sweep that started on bootstrap instead of starting another one.
    await service.startSweep();

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    expect(scheduler.addInterval).toHaveBeenCalledTimes(1);
  });

  it('does not start a second sweep while one is running', async () => {
    const { service, prisma } = setup();

    const first = service.startSweep();
    const second = service.startSweep();
    await first;

    expect(second).toBe(first);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });
});
