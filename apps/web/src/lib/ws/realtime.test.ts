import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  readonly handlers = new Map<string, Handler>();
  readonly io = { on: vi.fn() };
  readonly emitWithAck = vi.fn();
  readonly emit = vi.fn();

  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }

  timeout() {
    return { emitWithAck: this.emitWithAck };
  }

  trigger(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }

  removeAllListeners = vi.fn();
  disconnect = vi.fn();
  connect = vi.fn();
}

const sockets: FakeSocket[] = [];
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

const { RealtimeClient } = await import('./realtime');

const stock = (version: number, stockValue: number) => ({
  productId: 'p1',
  stock: stockValue,
  inStock: stockValue > 0,
  version,
});

describe('RealtimeClient', () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it('subscribes again on reconnect and applies the fresh snapshot', async () => {
    const client = new RealtimeClient();
    const onSnapshot = vi.fn();
    client.connect();
    const socket = sockets[0]!;
    socket.emitWithAck.mockImplementation(() =>
      Promise.resolve({ ok: true, snapshot: { channel: 'product', state: stock(7, 3) } }),
    );
    client.follow({ channel: 'product', id: 'p1' }, { onSnapshot, onEvent: vi.fn() });

    socket.connected = true;
    socket.trigger('connect');
    await vi.waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledTimes(1);
    });
    socket.trigger('disconnect', 'transport close');
    socket.trigger('connect');

    await vi.waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledTimes(2);
    });
    expect(socket.emitWithAck).toHaveBeenCalledWith('subscribe', { channel: 'product', id: 'p1' });
    expect(client.getStatus()).toBe('connected');
  });

  it('reports offline after a disconnect', () => {
    const client = new RealtimeClient();
    client.connect();
    sockets[0]!.trigger('disconnect', 'transport close');

    expect(client.getStatus()).toBe('offline');
  });
});
