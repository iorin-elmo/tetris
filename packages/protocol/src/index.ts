import { z } from 'zod';
import { rulesSchema, type Rules } from '../../rulesets/src/index';
import type { Active, GameState, Stats, statistics } from '../../engine/src/index';
export const PROTOCOL_VERSION = 1;
const id = z.string().min(1).max(100),
  integer = z.number().int().min(0).max(2147483647),
  name = z.string().trim().min(1).max(20);
export const inputSchema = z
  .object({
    left: z.boolean().optional(),
    right: z.boolean().optional(),
    soft: z.boolean().optional(),
    hard: z.boolean().optional(),
    cw: z.boolean().optional(),
    ccw: z.boolean().optional(),
    hold: z.boolean().optional(),
  })
  .strict();
const message = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), requestId: id, ...shape }).strict();
export const clientMessageSchema = z.discriminatedUnion('type', [
  message('hello', {
    protocolVersion: z.literal(PROTOCOL_VERSION),
    resumeToken: z.string().min(32).max(100).optional(),
    clientBuild: z.string().max(64),
  }),
  message('room.create', {
    name,
    settings: rulesSchema.optional(),
    password: z.string().max(100).optional(),
  }),
  message('room.join', {
    code: z.string().regex(/^[A-HJ-NP-Z2-9]{8,10}$/),
    displayName: name,
    password: z.string().max(100).optional(),
  }),
  message('room.leave', {}),
  message('room.return', {}),
  message('room.ready', { ready: z.boolean() }),
  message('room.rename', { name }),
  message('room.updateSettings', { expectedRevision: integer, patch: z.record(z.string(), z.unknown()) }),
  message('room.transferHost', { targetId: id }),
  message('room.kick', { targetId: id }),
  message('room.start', {}),
  message('team.assign', { targetId: id, team: z.number().int().min(0).max(3) }),
  message('team.autobalance.preview', {
    seed: integer,
    headcountPenalty: z.number().min(0).max(10).optional(),
  }),
  message('team.autobalance.apply', { previewId: id, candidate: z.number().int().min(0).max(2).default(0) }),
  message('input.configure', {
    dasMs: z.number().int().min(0).max(500),
    arrMs: z.number().int().min(0).max(200),
  }),
  message('input.batch', {
    matchId: id,
    frames: z
      .array(z.object({ tick: integer, seq: integer, input: inputSchema }).strict())
      .min(1)
      .max(12),
  }),
  message('target.select', { targetId: id }),
  message('state.checksum', { matchId: id, tick: integer, hash: z.string().regex(/^[0-9a-f]{8}$/) }),
  message('ping', { clientTime: z.number().finite() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export interface Skill {
  value: number;
  confidence: number;
  matches: number;
  pps: number;
  apm: number;
  app: number;
  survivalSeconds: number;
  winRate: number;
}
export interface Member {
  id: string;
  name: string;
  team: number;
  ready: boolean;
  connected: boolean;
  spectator: boolean;
  joinedAt: number;
  skill: Skill;
}
export interface RoomSnapshot {
  code: string;
  name: string;
  hostId: string;
  revision: number;
  status: 'lobby' | 'countdown' | 'playing' | 'results';
  settings: Rules;
  members: Member[];
  passwordProtected: boolean;
}
export interface PublicState {
  board: number[];
  active: Active | null;
  alive: boolean;
  stats: Stats;
  tick: number;
}
export interface PlayerFrame {
  id: string;
  name: string;
  team: number;
  state: PublicState;
  ko: number;
  target: string | null;
  placement: number | null;
}
export interface MatchFrame {
  matchId: string;
  tick: number;
  rules: Rules;
  players: PlayerFrame[];
  self: GameState | null;
  ackSeq: number;
  selfRules: Rules | null;
  startAt: number;
}
export interface Standing {
  id: string;
  name: string;
  team: number;
  place: number;
  teamPlace?: number;
  ko: number;
  stats: ReturnType<typeof statistics>;
}
export interface BalanceCandidate {
  assignments: Record<string, number>;
  score: number;
  teams: { team: number; skill: number; count: number; confidence: number }[];
}
export interface BalancePreview extends BalanceCandidate {
  previewId: string;
  revision: number;
  alternatives: BalanceCandidate[];
}
export type ServerMessage =
  | {
      type: 'welcome';
      requestId: string;
      sessionId: string;
      resumeToken: string;
      serverTime: number;
      roomCode: string | null;
      limits: { maxPlayers: number; tickRate: number; resumeSeconds: number };
    }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; requestId: string; code: string; message: string }
  | { type: 'room.snapshot'; room: RoomSnapshot }
  | { type: 'match.prepare'; matchId: string; seedCommitment: string; rulesSnapshot: Rules; startAt: number }
  | { [T in 'match.start' | 'match.snapshot' | 'state.resync']: { type: T } & MatchFrame }[
      'match.start' | 'match.snapshot' | 'state.resync']
  | { type: 'match.event'; matchId: string; tick: number; kind: string; payload: Record<string, unknown> }
  | {
      type: 'match.end';
      matchId: string;
      reason: string;
      placement: Standing[];
      winningTeams: number[];
      seedReveal: Record<string, number>;
    }
  | { type: 'team.autobalance.result'; requestId: string; preview: BalancePreview }
  | { type: 'pong'; requestId: string; clientTime: number; serverTime: number };
export function publicState(s: GameState): PublicState {
  return { board: s.board, active: s.active, alive: s.alive, stats: s.stats, tick: s.tick };
}
