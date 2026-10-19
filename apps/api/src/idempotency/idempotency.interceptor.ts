import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { UnauthorizedError } from '../common/exceptions';
import { resolveRouteTemplate } from '../common/utils';

import type { IdempotencyContext } from './idempotency-context';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY_HEADER,
  IDEMPOTENT_SCOPE_METADATA,
  type IdempotencyScope,
} from './idempotency.constants';
import { IdempotencyKeyRequiredError } from './idempotency.errors';
import { IdempotencyService } from './idempotency.service';
import { computeRequestHash } from './request-hash';

import './idempotency-context';

const HTTP_CODE_METADATA = '__httpCode__';
const DEFAULT_POST_STATUS = 201;
const DEFAULT_STATUS = 200;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Idempotency');

  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
    private readonly cls: ClsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const scope = this.reflector.get<IdempotencyScope>(
      IDEMPOTENT_SCOPE_METADATA,
      context.getHandler(),
    );
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const key = req.header(IDEMPOTENCY_HEADER);
    if (key === undefined || !isUUID(key)) {
      throw new IdempotencyKeyRequiredError();
    }
    const userId = this.cls.get('userId');
    if (userId === undefined) {
      throw new UnauthorizedError();
    }

    const acquired = await this.idempotency.acquire({
      userId,
      scope,
      key,
      requestHash: computeRequestHash({
        method: req.method,
        route: resolveRouteTemplate(req),
        params: req.params,
        body: req.body,
      }),
    });
    if (acquired.kind === 'replay') {
      res.setHeader(IDEMPOTENCY_REPLAY_HEADER, 'true');
      return of(acquired.body);
    }

    const state: IdempotencyContext = {
      lease: acquired.lease,
      statusCode: this.successStatus(context, req),
      completed: false,
    };
    this.cls.set('idempotency', state);

    return next.handle().pipe(
      mergeMap((body: unknown) => from(this.finish(state, body)).pipe(mergeMap(() => of(body)))),
      catchError((error: unknown) =>
        // A 4xx/5xx means the transaction rolled back: free the key so a retry starts afresh.
        from(this.idempotency.release(state.lease)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }

  private async finish(state: IdempotencyContext, body: unknown): Promise<void> {
    if (state.completed) {
      return;
    }
    this.logger.warn({
      msg: 'idempotency.not_completed_in_transaction',
      note: 'the use case did not call IdempotencyService.complete; recording after the fact',
    });
    await this.idempotency.completeAfterTheFact(state, body);
  }

  /** Nest applies the route's status after interceptors run, so derive it the same way. */
  private successStatus(context: ExecutionContext, req: Request): number {
    const declared = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );
    return declared ?? (req.method === 'POST' ? DEFAULT_POST_STATUS : DEFAULT_STATUS);
  }
}
