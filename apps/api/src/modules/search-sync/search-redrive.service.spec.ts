import type { ConfigType } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';

import type { searchConfig } from '../../config/search.config';
import type { SearchPort } from '../../search/search.port';

import { SearchRedrive } from './search-redrive.service';

function setup({ failed, available }: { failed: number; available: boolean }) {
  const jobs = Array.from({ length: failed }, () => ({
    retry: jest.fn().mockResolvedValue(undefined),
  }));
  const queue = {
    getFailedCount: jest.fn().mockResolvedValue(failed),
    getFailed: jest.fn().mockResolvedValue(jobs),
  };
  const search = { isAvailable: jest.fn().mockResolvedValue(available) };
  const settings: ConfigType<typeof searchConfig> = {
    host: 'http://meilisearch:7700',
    masterKey: 'test-master-key-0123456789',
    indexPrefix: 'test_',
    timeoutMs: 1500,
    redriveIntervalMs: 1000,
  };
  const redrive = new SearchRedrive(
    settings,
    search as unknown as SearchPort,
    queue as unknown as Queue,
    {} as SchedulerRegistry,
  );
  return { redrive, jobs, search };
}

describe('SearchRedrive.redrive', () => {
  it('queues every failed update again with fresh attempts once the index answers', async () => {
    const { redrive, jobs } = setup({ failed: 2, available: true });

    await expect(redrive.redrive()).resolves.toBe(2);

    for (const job of jobs) {
      expect(job.retry).toHaveBeenCalledWith('failed', {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
    }
  });

  it('leaves the failed updates alone while the index is still unreachable', async () => {
    const { redrive, jobs } = setup({ failed: 2, available: false });

    await expect(redrive.redrive()).resolves.toBe(0);

    expect(jobs[0]?.retry).not.toHaveBeenCalled();
  });

  it('does not even probe the index when nothing failed', async () => {
    const { redrive, search } = setup({ failed: 0, available: true });

    await expect(redrive.redrive()).resolves.toBe(0);

    expect(search.isAvailable).not.toHaveBeenCalled();
  });
});
