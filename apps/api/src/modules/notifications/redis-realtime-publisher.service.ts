import { Inject, Injectable } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { Emitter } from '@socket.io/redis-emitter';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';

import { WS_EVENTS_EMITTED_TOTAL } from '../../metrics/metrics.constants';
import { REDIS_CLIENT } from '../../redis/redis.constants';

import type { PushedNotification, RealtimePublisherPort } from './realtime-publisher.port';
import { WS_EVENT, WS_NAMESPACE, type WsEventName } from './ws-events';
import { userRoom } from './ws-rooms';

/**
 * Reaches the sockets of every api instance through Redis, from the worker, which holds no
 * connections itself. The emitter publishes without waiting, so the publishes are collected
 * and awaited here: a failure fails the job and the queue retries it.
 */
@Injectable()
export class RedisRealtimePublisher implements RealtimePublisherPort {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectMetric(WS_EVENTS_EMITTED_TOTAL) private readonly emitted: Counter<'event'>,
  ) {}

  async emit(room: string, event: WsEventName, payload: object): Promise<void> {
    const publishes: Promise<unknown>[] = [];
    const emitter = new Emitter({
      publish: (channel: string, message: string | Buffer) => {
        const publish = this.redis.publish(channel, message);
        publishes.push(publish);
        return publish;
      },
    });
    emitter.of(WS_NAMESPACE).to(room).emit(event, payload);
    await Promise.all(publishes);
    this.emitted.inc({ event });
  }

  notifyUser(userId: string, notification: PushedNotification): Promise<void> {
    return this.emit(userRoom(userId), WS_EVENT.NOTIFICATION, notification);
  }
}
