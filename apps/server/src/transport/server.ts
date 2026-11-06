import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Store } from '../persistence/store';
import { RoomService, type ServiceOptions } from '../rooms/service';
import { RateLimit } from '../security/limits';
export interface ServerOptions extends Partial<ServiceOptions> {
  database?: string;
  origins?: string[];
  trustProxy?: boolean;
  maxConnectionsPerIp?: number;
}
export function createGameServer(options: ServerOptions = {}) {
  const store = new Store(options.database ?? 'data/stacklane.sqlite');
  const service = new RoomService(store, {
    countdownMs: options.countdownMs ?? 3000,
    graceMs: options.graceMs ?? 30000,
    maxRooms: options.maxRooms ?? 100,
    maxSessions: options.maxSessions ?? 200,
  });
  const origins = new Set(
    options.origins ?? ['http://127.0.0.1:5173', 'http://localhost:5173', 'https://iorin-elmo.github.io'],
  );
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/health') {
      response.writeHead(200);
      response.end(
        JSON.stringify({
          ok: true,
          rooms: service.rooms.size,
          connections: wss.clients.size,
          uptime: Math.floor(process.uptime()),
        }),
      );
    } else {
      response.writeHead(404);
      response.end('{"error":"not found"}');
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false }),
    rate = new RateLimit(),
    connections = new Map<string, number>();
  server.on('upgrade', (request, socket, head) => {
    const remote = request.socket.remoteAddress ?? 'unknown';
    let ip = remote;
    if (options.trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') ip = forwarded.split(',')[0].trim();
    }
    if (
      request.url !== '/ws' ||
      !origins.has(request.headers.origin ?? '') ||
      !rate.take(`connect:${ip}`, 1, 20) ||
      (connections.get(ip) ?? 0) >= (options.maxConnectionsPerIp ?? 20) ||
      wss.clients.size >= (options.maxSessions ?? 200)
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    connections.set(ip, (connections.get(ip) ?? 0) + 1);
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, ip));
  });
  const alive = new WeakSet<WebSocket>();
  let closing = false;
  wss.on('connection', (socket: WebSocket, ip: string) => {
    let sessionId: string | null = null;
    alive.add(socket);
    const helloTimeout = setTimeout(() => {
      if (!sessionId) socket.close(4000, 'Hello timeout');
    }, 10000);
    helloTimeout.unref();
    socket.on('pong', () => alive.add(socket));
    socket.on('message', (data) => {
      if (!rate.take(`ip:${ip}`, 600, 1200) || !rate.take(`socket:${sessionId ?? ip}`, 120, 240)) {
        socket.close(1008, 'Rate limit');
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        service.send(socket, {
          type: 'error',
          requestId: 'invalid',
          code: 'INVALID_JSON',
          message: 'JSONが不正です。',
        });
        return;
      }
      sessionId = service.handle(socket, message, ip, sessionId);
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(helloTimeout);
      connections.set(ip, Math.max(0, (connections.get(ip) ?? 1) - 1));
      if (sessionId && !closing) service.disconnect(sessionId, socket);
    });
  });
  const tick = setInterval(() => {
    try {
      service.tick();
    } catch (error) {
      console.error('tick failed', error instanceof Error ? error.name : 'unknown');
    }
  }, 1000 / 60);
  const heartbeat = setInterval(() => {
    rate.prune();
    service.limits.prune();
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, 15000);
  return {
    server,
    wss,
    service,
    store,
    listen: (port = 3001, host = '127.0.0.1') =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        closing = true;
        clearInterval(tick);
        clearInterval(heartbeat);
        for (const socket of wss.clients) socket.terminate();
        wss.close();
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}
