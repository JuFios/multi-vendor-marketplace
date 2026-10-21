import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { IDEMPOTENCY_REPLAY_HEADER } from './idempotency.constants';

/**
 * Control flow, not a failure: Nest applies the route's HTTP status after interceptors run, so the
 * interceptor throws this to have a scoped filter answer with the recorded status and body.
 */
export class IdempotencyReplay extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: unknown,
  ) {
    super('Replaying the recorded response');
    this.name = 'IdempotencyReplay';
  }
}

@Catch(IdempotencyReplay)
export class IdempotencyReplayFilter implements ExceptionFilter<IdempotencyReplay> {
  catch(replay: IdempotencyReplay, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader(IDEMPOTENCY_REPLAY_HEADER, 'true');
    response.status(replay.statusCode).json(replay.body);
  }
}
