import { Inject, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Gauge } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Namespace, Socket } from 'socket.io';

import { Public } from '../../common/decorators/public.decorator';
import { AppError } from '../../common/exceptions/app-error';
import { realtimeConfig } from '../../config/realtime.config';
import { WS_CONNECTIONS } from '../../metrics/metrics.constants';
import { AccessTokenService } from '../auth/access-token.service';
import { AuctionsService } from '../bidding/auctions.service';
import { ProductsService } from '../products/products.service';

import {
  type SubscribeAck,
  type SubscribeSnapshot,
  type UnsubscribeAck,
  WS_CLIENT_MESSAGE,
  WS_ERROR_CODE,
  WS_NAMESPACE,
  WS_UNAUTHORIZED,
  type WsErrorCode,
} from './ws-events';
import { toAuctionState, toProductStock } from './ws-mappers';
import { exceedsLimit, parseSubscribeRequest, roomOf, sellerRoom, userRoom } from './ws-rooms';

interface SocketData {
  /** Public rooms this connection follows, counted against `WS_MAX_SUBSCRIPTIONS`. */
  followed: Set<string>;
  userId?: string;
}

const refusal = (
  code: WsErrorCode,
  message: string,
): { ok: false; error: { code: WsErrorCode; message: string } } => ({
  ok: false,
  error: { code, message },
});

/**
 * The `/realtime` namespace. A token in the handshake is optional: with one the socket joins
 * its `user:` and `seller:` rooms, without one it can follow public product and auction rooms.
 * Pushes come from the worker; this class only manages connections and answers `subscribe`
 * with the current state, which is what makes a reconnecting client consistent again.
 */
@Public()
@SkipThrottle()
@WebSocketGateway({ namespace: WS_NAMESPACE })
export class RealtimeGateway
  implements OnGatewayInit<Namespace>, OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly tokens: AccessTokenService,
    private readonly auctions: AuctionsService,
    private readonly products: ProductsService,
    @Inject(realtimeConfig.KEY) private readonly config: ConfigType<typeof realtimeConfig>,
    @InjectMetric(WS_CONNECTIONS) private readonly connections: Gauge,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      this.admit(socket).then(
        () => {
          next();
        },
        (error: unknown) => {
          next(error instanceof Error ? error : new Error(WS_UNAUTHORIZED));
        },
      );
    });
  }

  handleConnection(socket: Socket): void {
    this.connections.inc();
    this.logger.log({
      msg: 'ws.connected',
      authenticated: this.dataOf(socket).userId !== undefined,
    });
  }

  handleDisconnect(): void {
    this.connections.dec();
  }

  @SubscribeMessage(WS_CLIENT_MESSAGE.SUBSCRIBE)
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    const request = parseSubscribeRequest(body);
    if (request === null) {
      return refusal(WS_ERROR_CODE.INVALID_SUBSCRIPTION, 'Unknown channel or invalid id');
    }
    const data = this.dataOf(socket);
    if (exceedsLimit(data.followed, request, this.config.maxSubscriptions)) {
      return refusal(WS_ERROR_CODE.SUBSCRIPTION_LIMIT, 'Too many subscriptions on this connection');
    }

    // Join before reading: an update pushed in between is applied or dropped by its version.
    const room = roomOf(request);
    await socket.join(room);
    try {
      const snapshot: SubscribeSnapshot =
        request.channel === 'auction'
          ? {
              channel: 'auction',
              state: toAuctionState(await this.auctions.getSnapshot(request.id)),
            }
          : {
              channel: 'product',
              state: toProductStock(
                request.id,
                await this.products.getPublicAvailability(request.id),
              ),
            };
      data.followed.add(room);
      return { ok: true, snapshot };
    } catch (error) {
      await socket.leave(room);
      return this.failure(error, request.channel, request.id);
    }
  }

  @SubscribeMessage(WS_CLIENT_MESSAGE.UNSUBSCRIBE)
  async unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<UnsubscribeAck> {
    const request = parseSubscribeRequest(body);
    if (request === null) {
      return refusal(WS_ERROR_CODE.INVALID_SUBSCRIPTION, 'Unknown channel or invalid id');
    }
    const room = roomOf(request);
    await socket.leave(room);
    this.dataOf(socket).followed.delete(room);
    return { ok: true };
  }

  /** Handshake middleware: validates the optional token and joins the caller's own rooms. */
  private async admit(socket: Socket): Promise<void> {
    const data: SocketData = { followed: new Set<string>() };
    socket.data = data;
    const { token } = socket.handshake.auth as { token?: unknown };
    if (token === undefined || token === null) {
      return;
    }
    const user = typeof token === 'string' ? await this.tokens.verify(token) : null;
    if (user === null) {
      throw Object.assign(new Error(WS_UNAUTHORIZED), { data: { code: WS_UNAUTHORIZED } });
    }
    data.userId = user.userId;
    await socket.join(userRoom(user.userId));
    if (user.sellerId !== undefined) {
      await socket.join(sellerRoom(user.sellerId));
    }
  }

  private dataOf(socket: Socket): SocketData {
    return socket.data as SocketData;
  }

  private failure(error: unknown, channel: string, id: string): SubscribeAck {
    if (error instanceof AppError && error.httpStatus === 404) {
      return refusal(WS_ERROR_CODE.NOT_FOUND, `${channel} not found`);
    }
    this.logger.error({
      msg: 'ws.subscribe_failed',
      channel,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return refusal(WS_ERROR_CODE.INTERNAL, 'Could not read the current state');
  }
}
