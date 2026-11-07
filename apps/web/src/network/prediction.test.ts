import { expect, it } from 'vitest';
import {
  createGame,
  step,
  checksum,
  type GameState,
  type Input,
} from '../../../../packages/engine/src/index';
import { PROJECT_DEFAULT as rules } from '../../../../packages/rulesets/src/index';
import { publicState, type MatchFrame } from '../../../../packages/protocol/src/index';
import { Prediction } from './prediction';

const snapshot = (state = createGame(1)): MatchFrame => ({
  matchId: 'm',
  tick: state.tick,
  self: state,
  selfRules: rules,
  rules,
  players: [],
  ackSeq: -1,
  receivedSeq: -1,
  pendingInputs: [],
  heldInput: {},
  startAt: 0,
});
function simulate(state: GameState, until: number, inputs: Record<number, Input>, r = rules) {
  while (state.tick < until && state.alive) state = step(state, inputs[state.tick + 1] ?? {}, r).state;
  return state;
}

it('advances gravity in the gaps before a delayed drop instead of counting input frames', () => {
  const p = new Prediction();
  const r = { ...rules, gravityTicks: 1 };
  const frame = { ...snapshot(), rules: r, selfRules: r };
  p.reconcile(frame, 0, true);
  p.queue(10, { hard: true });
  expect(checksum(p.state!)).toBe(checksum(simulate(frame.self!, 10, { 10: { hard: true } }, r)));
});

it.each(['ppt2', 'tetrio'] as const)(
  'applies %s garbage on the drop at its actual arrival tick',
  (garbageStyle) => {
    const state = createGame(1);
    const r = { ...rules, garbageStyle, garbageActivationTicks: 2 };
    state.garbage.push({
      id: 'attack',
      sourceId: 'b',
      targetId: 'a',
      lines: 4,
      createdTick: 0,
      arrivalTick: 7,
      holes: [9, 9, 9, 9],
      status: 'pending',
    });
    const p = new Prediction();
    p.reconcile({ ...snapshot(state), rules: r, selfRules: r }, 0, true);
    p.queue(3, { hard: true });
    expect(p.state!.stats.receivedGarbage).toBe(0);
    p.queue(9, { hard: true });
    const actual = simulate(state, 9, { 3: { hard: true }, 9: { hard: true } }, r);
    expect(actual.stats.receivedGarbage).toBe(4);
    expect(checksum(p.state!)).toBe(checksum(actual));
    // Repeated snapshots with accepted inputs must not insert the packet again.
    p.reconcile({ ...snapshot(actual), ackSeq: 1, receivedSeq: 1, rules: r, selfRules: r }, 9);
    expect(p.state!.stats.receivedGarbage).toBe(4);
  },
);

it('uses server scheduling for received inputs and never replays accepted HOLD twice', () => {
  const p = new Prediction();
  const frame = {
    ...snapshot(),
    receivedSeq: 1,
    pendingInputs: [
      { seq: 0, tick: 6, input: { hold: true } },
      { seq: 1, tick: 8, input: { hard: true } },
    ],
  };
  p.reconcile(frame, 0, true);
  p.queue(4, { hard: true });
  expect(p.state!.hold).toBeNull();
  expect(p.state!.stats.placements).toBe(0);
  p.queue(9, {});
  expect(checksum(p.state!)).toBe(
    checksum(simulate(frame.self!, 9, { 6: { hold: true }, 8: { hard: true }, 9: { hard: true } })),
  );
});

it('does not show a speculative KO or send more drops, and a confirmed KO cannot revive', () => {
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 36 };
  state.queue[0] = 'O';
  state.board[19 * 10 + 4] = 8;
  const p = new Prediction();
  p.reconcile(snapshot(state), 0, true);
  p.queue(1, { hard: true });
  expect(p.state!.alive).toBe(true);
  p.queue(2, { hard: true });
  expect(p.outbound.at(-1)!.input).toEqual({});
  const dead = step(state, { hard: true }, rules).state;
  expect(dead.alive).toBe(false);
  p.reconcile({ ...snapshot(dead), ackSeq: 0, receivedSeq: 1 }, 2);
  expect(p.state!.alive).toBe(false);
  expect(p.reconcile(snapshot(state), 2)).toBe(false);
  expect(p.state!.alive).toBe(false);
  expect(p.outbound).toHaveLength(0);
});

it('keeps a server KO event terminal even if the next snapshot predates that event', () => {
  const p = new Prediction();
  const frame = snapshot();
  p.reconcile(frame, 0, true);
  p.confirmKO(4);
  p.reconcile(frame, 3);
  expect(p.alive).toBe(false);
  expect(p.state!.alive).toBe(false);
});
it('does not consume a sequence number for stale or excessively future input ticks', () => {
  const p = new Prediction();
  p.reconcile(snapshot(), 0, true);
  p.queue(1000, { hard: true });
  p.queue(0, { hard: true });
  expect(p.outbound).toEqual([]);
  p.queue(1, { hard: true });
  expect(p.outbound[0].seq).toBe(0);
});

it('keeps pending schedules private to their owner', () => {
  expect(publicState(createGame(1))).not.toHaveProperty('pendingInputs');
});
