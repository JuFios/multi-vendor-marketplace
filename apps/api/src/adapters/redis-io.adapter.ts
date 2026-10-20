import type { INestApplicationContext } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

import { httpConfig } from '../config/http.config';
import { RedisConnectionFactory } from '../redis/redis-connection.factory';

/**
 * The adapter fires its subscribe and publish commands without handling the result, so a command still
 * queued when the connection is closed would surface as an unhandled rejection. The connection
 * errors themselves are logged by the factory.
 */
function tolerateRejectedCommands(client: Redis): void {
  const send = client.sendCommand.bind(client);
  client.sendCommand = (command, stream) => {
    (command.promise as Promise<unknown>).catch(() => undefined);
    return send(command, stream);
  };
}

/**
 * Socket.IO over Redis pub/sub: rooms are shared by every api instance, and the worker, which
 * has no connections, reaches them through the same channels with an emitter.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(private readonly context: INestApplicationContext) {
    super(context);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const factory = this.context.get(RedisConnectionFactory);
    const { webOrigin } = this.context.get<ConfigType<typeof httpConfig>>(httpConfig.KEY);
    // The adapter does not handle rejected commands: while Redis is down they must wait for the
    // reconnect instead of failing.
    const pub = factory.create('ws-pub', { maxRetriesPerRequest: null });
    const sub = factory.create('ws-sub', { maxRetriesPerRequest: null });
    tolerateRejectedCommands(pub);
    tolerateRejectedCommands(sub);
    this.clients.push(pub, sub);

    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: webOrigin, credentials: true },
    }) as Server;
    server.adapter(createAdapter(pub, sub));
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(
      this.clients.map(async (client) => {
        // `quit` would wait in the offline queue forever if Redis is unreachable.
        if (client.status !== 'ready') {
          client.disconnect();
          return;
        }
        await client.quit().catch(() => {
          client.disconnect();
        });
      }),
    );
  }
}
