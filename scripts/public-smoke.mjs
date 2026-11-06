import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const endpoint = 'wss://tetris.server-on.net/ws';
const origin = 'https://iorin-elmo.github.io';
const peers = [];
async function connect(name) {
  const socket = new WebSocket(endpoint, { origin });
  const messages = [];
  let sequence = 0;
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (!['match.snapshot', 'match.event'].includes(message.type)) messages.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const wait = async (type, predicate = () => true) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const error = messages.find((message) => message.type === 'error');
      if (error) throw new Error(`${error.code}: ${error.message}`);
      const index = messages.findIndex((message) => message.type === type && predicate(message));
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`Public WebSocket timeout: ${type}`);
  };
  const send = (type, data = {}) => {
    const requestId = `public-${sequence++}`;
    socket.send(JSON.stringify({ type, requestId, ...data }));
    return requestId;
  };
  const peer = { name, socket, send, wait, inRoom: false };
  peers.push(peer);
  send('hello', { protocolVersion: 1, clientBuild: 'public-smoke' });
  await wait('welcome');
  return peer;
}

try {
  const health = await fetch('https://tetris.server-on.net/health', { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const host = await connect('CHECK 01');
  host.send('room.create', { name: host.name });
  const { room } = await host.wait('room.snapshot');
  host.inRoom = true;
  for (let i = 2; i <= 10; i++) {
    const guest = await connect(`CHECK ${String(i).padStart(2, '0')}`);
    const joined = guest.send('room.join', { code: room.code, displayName: guest.name });
    await guest.wait('ack', (message) => message.requestId === joined);
    guest.inRoom = true;
  }
  host.send('room.start');
  for (const peer of peers) {
    const start = await peer.wait('match.start');
    assert.equal(start.players.length, 10);
    assert.equal(start.rules.nextCount, 5);
    assert.ok(start.self.queue.length >= 5);
    for (const player of start.players) {
      assert.equal(Object.hasOwn(player.state, 'queue'), false);
      assert.equal(Object.hasOwn(player.state, 'rng'), false);
    }
  }
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint, { origin: 'https://invalid.example' });
      socket.once('open', () => {
        socket.close();
        resolve();
      });
      socket.once('error', reject);
    }),
    /403/,
  );
  console.log(
    JSON.stringify(
      {
        https: true,
        wss: true,
        players: 10,
        next: 5,
        privateStateRedacted: true,
        invalidOriginRejected: true,
      },
      null,
      2,
    ),
  );
} finally {
  for (const peer of peers) {
    if (peer.inRoom && peer.socket.readyState === WebSocket.OPEN) {
      try {
        const leaving = peer.send('room.leave');
        await peer.wait('ack', (message) => message.requestId === leaving);
      } catch {
        /* Close still releases the session after its normal grace period. */
      }
    }
    peer.socket.close();
  }
}
