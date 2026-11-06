import { useEffect, useRef, useState } from 'react';
import {
  createGame,
  step,
  checksum,
  type GameState,
  type Input,
} from '../../../../packages/engine/src/index';
import {
  PROTOCOL_VERSION,
  type RoomSnapshot,
  type MatchFrame,
  type ServerMessage,
  type PlayerFrame,
  type BalancePreview,
} from '../../../../packages/protocol/src/index';
import type { Rules } from '../../../../packages/rulesets/src/index';
import type { Controller } from '../input/controller';
import type { Preferences } from '../settings/store';
import type { GameResult } from '../game/useLocalGame';
import { sound } from '../game/audio';
interface OnlineGame {
  matchId: string;
  state: GameState;
  rules: Rules;
  selfRules: Rules;
  players: PlayerFrame[];
  result: GameResult | null;
  menu: boolean;
  message: string;
  target: string | null;
  spectator: boolean;
  startAt: number;
}
interface Frame {
  tick: number;
  seq: number;
  input: Input;
}
export interface OnlineState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  id: string | null;
  room: RoomSnapshot | null;
  game: OnlineGame | null;
  error: string;
  countdown: number | null;
  latency: number;
  balance: BalancePreview | null;
}
const asGame = (p: PlayerFrame, r: Rules): GameState => ({
  ...createGame(1, r),
  ...p.state,
  queue: [],
  rng: 0,
});
export function useOnline(controller: Controller, prefs: Preferences) {
  const [view, setView] = useState<OnlineState>({
    status: 'disconnected',
    id: null,
    room: null,
    game: null,
    error: '',
    countdown: null,
    latency: 0,
    balance: null,
  });
  const model = useRef(view),
    preferences = useRef(prefs);
  preferences.current = prefs;
  const socket = useRef<WebSocket | null>(null),
    desired = useRef(false),
    connectPromise = useRef<Promise<void> | null>(null),
    resolveConnect = useRef<(() => void) | null>(null),
    rejectConnect = useRef<((e: Error) => void) | null>(null);
  const requestCounter = useRef(0),
    pendingRequests = useRef(
      new Map<
        string,
        { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
      >(),
    );
  const lifecycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef<Frame[]>([]),
    outbound = useRef<Frame[]>([]),
    nextSeq = useRef(0),
    timelineTick = useRef(0),
    offset = useRef(0),
    restart = useRef(false),
    reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    retry = useRef(0);
  const update = () =>
    setView({ ...model.current, game: model.current.game ? { ...model.current.game } : null });
  const send = (type: string, data: Record<string, unknown> = {}) => {
    const requestId = `w-${requestCounter.current++}`;
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ type, requestId, ...data }));
    return requestId;
  };
  const request = (type: string, data: Record<string, unknown> = {}) =>
    new Promise<void>((resolve, reject) => {
      if (socket.current?.readyState !== WebSocket.OPEN) {
        reject(new Error('サーバーに接続されていません。'));
        return;
      }
      const id = send(type, data),
        timer = setTimeout(() => {
          pendingRequests.current.delete(id);
          reject(new Error('応答がありません。接続を確認してください。'));
        }, 10000);
      pendingRequests.current.set(id, { resolve, reject, timer });
    });
  const reconcile = (frame: MatchFrame, initial = false) => {
    const self = frame.self,
      existing = model.current.game,
      reset = initial || restart.current || existing?.matchId !== frame.matchId;
    if (reset) {
      inputs.current = [];
      outbound.current = [];
      nextSeq.current = frame.ackSeq + 1;
      timelineTick.current = Math.max(
        frame.tick,
        Math.floor(((Date.now() + offset.current - frame.startAt) * 60) / 1000),
      );
      restart.current = false;
    }
    inputs.current = inputs.current.filter((f) => f.seq > frame.ackSeq);
    let state = self;
    if (state)
      for (const f of inputs.current) state = step(state, f.input, frame.selfRules ?? frame.rules).state;
    const watched = frame.players.find((p) => p.state.alive) ?? frame.players[0];
    if (!state && watched) state = asGame(watched, frame.rules);
    if (!state) return;
    model.current.game = {
      matchId: frame.matchId,
      state,
      rules: frame.rules,
      selfRules: frame.selfRules ?? frame.rules,
      players: frame.players,
      result: reset ? null : (existing?.result ?? null),
      menu: existing?.menu ?? false,
      message: existing?.message ?? '',
      target: frame.players.find((p) => p.id === model.current.id)?.target ?? null,
      spectator: !self,
      startAt: frame.startAt,
    };
    model.current.countdown = null;
  };
  const connect = (): Promise<void> => {
    if (socket.current?.readyState === WebSocket.OPEN && model.current.status === 'connected')
      return Promise.resolve();
    if (connectPromise.current) return connectPromise.current;
    const url = preferences.current.wsUrl.trim();
    try {
      const u = new URL(url);
      if (!['ws:', 'wss:'].includes(u.protocol) || (location.protocol === 'https:' && u.protocol !== 'wss:'))
        throw new Error();
    } catch {
      return Promise.reject(new Error('接続URLを確認してください。HTTPSのページでは wss:// が必要です。'));
    }
    desired.current = true;
    model.current.status = model.current.room ? 'reconnecting' : 'connecting';
    model.current.error = '';
    update();
    connectPromise.current = new Promise<void>((resolve, reject) => {
      resolveConnect.current = resolve;
      rejectConnect.current = reject;
    });
    const ws = new WebSocket(url);
    socket.current = ws;
    const timeout = setTimeout(() => {
      if (model.current.status !== 'connected') ws.close();
    }, 10000);
    ws.onopen = () => {
      const token = localStorage.getItem(`stacklane.token:${url}`);
      send('hello', {
        protocolVersion: PROTOCOL_VERSION,
        clientBuild: '0.1.0',
        ...(token ? { resumeToken: token } : {}),
      });
    };
    ws.onmessage = (event) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }
      if (m.type === 'welcome') {
        if (!m.roomCode) {
          model.current.room = null;
          model.current.game = null;
          model.current.countdown = null;
          localStorage.removeItem(`stacklane.room:${url}`);
        }
        clearTimeout(timeout);
        localStorage.setItem(`stacklane.token:${url}`, m.resumeToken);
        offset.current = m.serverTime - Date.now();
        model.current.id = m.sessionId;
        model.current.status = 'connected';
        model.current.error = '';
        retry.current = 0;
        resolveConnect.current?.();
        connectPromise.current = null;
      } else if (m.type === 'ack') {
        const p = pendingRequests.current.get(m.requestId);
        if (p) {
          clearTimeout(p.timer);
          p.resolve();
          pendingRequests.current.delete(m.requestId);
        }
      } else if (m.type === 'error') {
        const p = pendingRequests.current.get(m.requestId);
        if (p) {
          clearTimeout(p.timer);
          p.reject(new Error(m.message));
          pendingRequests.current.delete(m.requestId);
        }
        if (m.code === 'INVALID_TOKEN') {
          localStorage.removeItem(`stacklane.token:${url}`);
          ws.close();
        } else if (m.code === 'KICKED') {
          model.current.room = null;
          model.current.game = null;
          model.current.error = m.message;
          desired.current = false;
        } else if (!['NO_MATCH', 'STALE_MATCH', 'SPECTATOR'].includes(m.code))
          model.current.error = m.message;
      } else if (m.type === 'room.snapshot') {
        model.current.room = m.room;
        localStorage.setItem(`stacklane.room:${url}`, m.room.code);
      } else if (m.type === 'match.prepare') {
        model.current.countdown = m.startAt;
        model.current.game = null;
        inputs.current = [];
        outbound.current = [];
        controller.reset();
      } else if (m.type === 'match.start' || m.type === 'match.snapshot' || m.type === 'state.resync') {
        reconcile(m, m.type === 'match.start');
        if (m.self && m.tick % 120 === 0)
          send('state.checksum', { matchId: m.matchId, tick: m.self.tick, hash: checksum(m.self) });
      } else if (m.type === 'match.event') {
        const game = model.current.game;
        if (game && m.kind === 'lock' && m.payload.playerId === model.current.id) {
          const e = m.payload;
          game.message = e.perfectClear
            ? 'PERFECT CLEAR'
            : e.spin === 'full'
              ? `T-SPIN ${e.lines} LINES`
              : e.lines === 4
                ? 'TETRIS'
                : Number(e.ren) > 0
                  ? `${e.ren} REN`
                  : e.lines
                    ? `${e.lines} LINE CLEAR`
                    : '';
          sound(Number(e.lines) > 0 ? 'clear' : 'lock', preferences.current.volume);
        }
      } else if (m.type === 'match.end') {
        const game = model.current.game;
        if (game && game.matchId === m.matchId) {
          const me = m.placement.find((p) => p.id === model.current.id),
            success =
              game.rules.mode === 'team'
                ? !!me && m.winningTeams.includes(me.team)
                : me?.place === 1 && m.reason !== 'draw';
          game.result = {
            title: m.reason === 'draw' ? 'DRAW' : success ? 'YOU WIN!' : 'MATCH FINISHED',
            success,
            standings: m.placement,
          };
          inputs.current = [];
          outbound.current = [];
          sound('end', preferences.current.volume);
        }
      } else if (m.type === 'pong') {
        const now = Date.now();
        model.current.latency = Math.max(0, now - m.clientTime);
        offset.current = m.serverTime - (m.clientTime + now) / 2;
      } else if (m.type === 'team.autobalance.result') model.current.balance = m.preview;
      update();
    };
    ws.onerror = () => {};
    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (socket.current !== ws) return;
      socket.current = null;
      connectPromise.current = null;
      rejectConnect.current?.(
        new Error('対戦サーバーに接続できません。起動状況と接続URLを確認してください。'),
      );
      resolveConnect.current = null;
      rejectConnect.current = null;
      for (const p of pendingRequests.current.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('接続が切れました。'));
      }
      pendingRequests.current.clear();
      inputs.current = [];
      outbound.current = [];
      restart.current = true;
      if (event.code === 4001) {
        desired.current = false;
        model.current.error = '別のタブで接続されました。';
      }
      if (desired.current && model.current.room) {
        model.current.status = 'reconnecting';
        reconnectTimer.current = setTimeout(
          () => {
            void connect().catch(() => {});
          },
          Math.min(5000, 500 * 2 ** retry.current++),
        );
      } else {
        model.current.status = 'disconnected';
        if (desired.current)
          model.current.error = '対戦サーバーに接続できません。サーバーの準備後に再試行してください。';
      }
      update();
    };
    return connectPromise.current;
  };
  const flush = () => {
    if (outbound.current.length && socket.current?.readyState === WebSocket.OPEN) {
      send('input.batch', { matchId: model.current.game?.matchId, frames: outbound.current.splice(0, 12) });
    }
  };
  const target = (id: string) => {
    const game = model.current.game;
    if (!game || game.rules.targeting !== 'manual' || game.spectator) return;
    game.target = id;
    send('target.select', { targetId: id });
    update();
  };
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const game = model.current.game;
      if (game && !game.result && model.current.status === 'connected') {
        const wall = Math.floor(((Date.now() + offset.current - game.startAt) * 60) / 1000);
        for (let n = 0; timelineTick.current < wall && n < 6; n++) {
          timelineTick.current++;
          const read = controller.poll();
          if (read.menu) {
            game.menu = !game.menu;
            controller.reset();
          }
          if (read.target) {
            const enemies = game.players.filter(
              (p) =>
                p.id !== model.current.id &&
                p.state.alive &&
                (game.rules.mode !== 'team' ||
                  p.team !== game.players.find((p) => p.id === model.current.id)?.team),
            );
            if (enemies.length) {
              const i = enemies.findIndex((p) => p.id === game.target);
              target(enemies[(i + read.target + enemies.length) % enemies.length].id);
            }
          }
          if (!game.spectator && game.state.alive) {
            const input = game.menu ? {} : read.input,
              f = { tick: timelineTick.current + game.rules.inputDelayTicks, seq: nextSeq.current++, input };
            game.state = step(game.state, input, game.selfRules).state;
            inputs.current.push(f);
            outbound.current.push(f);
            if (outbound.current.length >= 3 || input.hard || input.hold || input.cw || input.ccw) flush();
          }
        }
        update();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const ping = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN) send('ping', { clientTime: Date.now() });
    }, 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ping);
    };
  }, [controller]);
  useEffect(() => {
    if (lifecycleTimer.current) clearTimeout(lifecycleTimer.current);
    const url = preferences.current.wsUrl.trim();
    if (localStorage.getItem(`stacklane.room:${url}`) && localStorage.getItem(`stacklane.token:${url}`))
      void connect().catch(() => {});
    return () => {
      lifecycleTimer.current = setTimeout(() => {
        desired.current = false;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        socket.current?.close();
      }, 0);
    };
  }, []);
  useEffect(() => {
    if (
      model.current.room &&
      ['lobby', 'results'].includes(model.current.room.status) &&
      socket.current?.readyState === WebSocket.OPEN
    )
      send('input.configure', { dasMs: prefs.dasMs, arrMs: prefs.arrMs });
  }, [prefs.dasMs, prefs.arrMs, view.room?.status, view.room?.code]);
  useEffect(() => {
    const room = model.current.room,
      name = prefs.displayName.trim();
    if (
      room &&
      name &&
      room.members.find((m) => m.id === model.current.id)?.name !== name &&
      socket.current?.readyState === WebSocket.OPEN
    )
      send('room.rename', { name });
  }, [prefs.displayName]);
  const action = async (type: string, data: Record<string, unknown> = {}) => {
    try {
      model.current.error = '';
      await request(type, data);
    } catch (e) {
      model.current.error = e instanceof Error ? e.message : '操作に失敗しました。';
      update();
      throw e;
    }
  };
  return {
    view,
    connect,
    action,
    target,
    create: async (name: string, password: string) => {
      await connect();
      await request('input.configure', {
        dasMs: preferences.current.dasMs,
        arrMs: preferences.current.arrMs,
      });
      await action('room.create', { name, password });
    },
    join: async (code: string, name: string, password: string) => {
      await connect();
      await request('input.configure', {
        dasMs: preferences.current.dasMs,
        arrMs: preferences.current.arrMs,
      });
      await action('room.join', { code, displayName: name, password });
    },
    leave: async () => {
      try {
        await request('room.leave');
      } finally {
        localStorage.removeItem(`stacklane.room:${preferences.current.wsUrl.trim()}`);
        model.current.room = null;
        model.current.game = null;
        model.current.countdown = null;
        desired.current = false;
        socket.current?.close();
        update();
      }
    },
    menu: () => {
      if (model.current.game) {
        model.current.game.menu = !model.current.game.menu;
        controller.reset();
        update();
      }
    },
    returnToLobby: () => {
      model.current.game = null;
      model.current.countdown = null;
      void action('room.return').catch(() => {});
      update();
    },
    dismissError: () => {
      model.current.error = '';
      update();
    },
  };
}
