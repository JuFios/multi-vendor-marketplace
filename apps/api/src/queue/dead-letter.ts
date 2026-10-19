import { UnrecoverableError } from 'bullmq';

interface FailedJob {
  attemptsMade: number;
  opts: { attempts?: number };
}

/**
 * True when a failure is final: the retries are used up, or the consumer declared the error
 * unrecoverable. Such a job stays in the failed set, which serves as the dead-letter queue.
 */
export function isDeadLetter(job: FailedJob, error: Error): boolean {
  return error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
}
