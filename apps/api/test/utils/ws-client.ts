import type { AddressInfo } from 'node:net';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { io, type Socket } from 'socket.io-client';

import type { SubscribeAck } from '../../src/modules/notifications/ws-events';
import { WS_NAMESPACE } from '../../src/modules/notifications/ws-events';

import { waitUntil } from './wait-until';

export interface Received {
  readonly event: string;
  readonly payload: unknown;
}

export interface TestSocket {
  readonly socket: Socket;
  readonly received: Received[];
  /** Events of one name received so far, oldest first. */
  eventsOf<T = unknown>(event: string): T[];
  /**
   * The latest event of that name, or, with `matching`, the latest one it accepts. Use `matching`
   * when several events share a name and the order they arrive in is not guaranteed.
   */
  waitForEvent<T = unknown>(
    event: string,
    timeoutMs?: number,
    matching?: (payload: T) => boolean,
  ): Promise<T>;
  subscribe(channel: string, id: string): Promise<SubscribeAck>;
  close(): void;
}

/** Starts the HTTP server of a test app on a free port and returns its base URL. */
export async function listenOn(app: NestExpressApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Connects to `/realtime`; rejects with the `connect_error` message when the handshake is refused. */
export function connectSocket(baseUrl: string, token?: string): Promise<TestSocket> {
  const socket = io(`${baseUrl}${WS_NAMESPACE}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(token === undefined ? {} : { auth: { token } }),
  });
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => {
    received.push({ event, payload });
  });

  const wrapped: TestSocket = {
    socket,
    received,
    eventsOf: <T>(event: string) =>
      received.filter((entry) => entry.event === event).map((entry) => entry.payload as T),
    waitForEvent: async <T>(
      event: string,
      timeoutMs = 5000,
      matching: (payload: T) => boolean = () => true,
    ) => {
      const found = () =>
        received.filter((entry) => entry.event === event && matching(entry.payload as T)).at(-1);
      await waitUntil(() => found() !== undefined, {
        timeoutMs,
        label: `a matching "${event}" event`,
      });
      return found()?.payload as T;
    },
    subscribe: (channel, id) =>
      socket.emitWithAck('subscribe', { channel, id }) as Promise<SubscribeAck>,
    close: () => {
      socket.close();
    },
  };
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve(wrapped);
    });
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}
