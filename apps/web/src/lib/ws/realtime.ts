import { io, type Socket } from 'socket.io-client';

import { sessionStore } from '../session';

import {
  type AuctionStatePayload,
  type ProductStockPayload,
  type SubscribeAck,
  type SubscribeRequest,
  type WsChannel,
  channelKey,
  WS_CLIENT_MESSAGE,
  WS_EVENT,
  WS_NAMESPACE,
  WS_UNAUTHORIZED,
} from './ws-events';

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface ChannelHandlers {
  onSnapshot: (snapshot: ProductStockPayload | AuctionStatePayload) => void;
  onEvent: (payload: ProductStockPayload | AuctionStatePayload) => void;
}

type StatusListener = (status: ConnectionStatus) => void;
type ConnectListener = () => void;

export class RealtimeClient {
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'offline';
  private readonly channels = new Map<
    string,
    { request: SubscribeRequest; handlers: Set<ChannelHandlers> }
  >();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly connectListeners = new Set<ConnectListener>();

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onConnect(listener: ConnectListener): () => void {
    this.connectListeners.add(listener);
    return () => {
      this.connectListeners.delete(listener);
    };
  }

  connect(): void {
    if (this.socket !== null) {
      return;
    }
    this.setStatus('connecting');
    const socket = io(WS_NAMESPACE, {
      path: '/socket.io',
      auth: (cb) => {
        cb({ token: sessionStore.getAccessToken() ?? undefined });
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8_000,
      autoConnect: true,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.setStatus('connected');
      void this.resubscribeAll();
      this.connectListeners.forEach((listener) => {
        listener();
      });
    });
    socket.on('disconnect', () => {
      this.setStatus('offline');
    });
    socket.io.on('reconnect_attempt', () => {
      this.setStatus('connecting');
    });
    socket.on('connect_error', (error) => {
      this.setStatus('offline');
      if (error.message === WS_UNAUTHORIZED) {
        sessionStore.setSession(null);
      }
    });
    socket.on(WS_EVENT.PRODUCT_STOCK, (payload: ProductStockPayload) => {
      this.dispatch('product', payload.productId, payload);
    });
    socket.on(WS_EVENT.AUCTION_STATE, (payload: AuctionStatePayload) => {
      this.dispatch('auction', payload.auctionId, payload);
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('offline');
  }

  follow(request: SubscribeRequest, handlers: ChannelHandlers): () => void {
    const key = channelKey(request.channel, request.id);
    const entry = this.channels.get(key) ?? { request, handlers: new Set() };
    entry.handlers.add(handlers);
    this.channels.set(key, entry);
    if (this.socket?.connected === true) {
      void this.subscribe(request, handlers);
    }
    return () => {
      entry.handlers.delete(handlers);
      if (entry.handlers.size === 0) {
        this.channels.delete(key);
        if (this.socket?.connected === true) {
          this.socket.emit(WS_CLIENT_MESSAGE.UNSUBSCRIBE, request);
        }
      }
    };
  }

  private async resubscribeAll(): Promise<void> {
    await Promise.all(
      [...this.channels.values()].map(async ({ request, handlers }) => {
        for (const handler of handlers) {
          await this.subscribe(request, handler);
        }
      }),
    );
  }

  private async subscribe(request: SubscribeRequest, handlers: ChannelHandlers): Promise<void> {
    const socket = this.socket;
    if (socket === null) {
      return;
    }
    const ack = (await socket
      .timeout(8_000)
      .emitWithAck(WS_CLIENT_MESSAGE.SUBSCRIBE, request)) as SubscribeAck;
    if (ack.ok) {
      handlers.onSnapshot(ack.snapshot.state);
    }
  }

  private dispatch(
    channel: WsChannel,
    id: string,
    payload: ProductStockPayload | AuctionStatePayload,
  ): void {
    const entry = this.channels.get(channelKey(channel, id));
    entry?.handlers.forEach((handler) => {
      handler.onEvent(payload);
    });
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => {
      listener(status);
    });
  }
}

export const realtimeClient = new RealtimeClient();
