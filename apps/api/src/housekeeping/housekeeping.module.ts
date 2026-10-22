import { Module } from '@nestjs/common';

import { HousekeepingService } from './housekeeping.service';

/** Worker-only: the api process never sweeps. */
@Module({ providers: [HousekeepingService] })
export class HousekeepingModule {}
