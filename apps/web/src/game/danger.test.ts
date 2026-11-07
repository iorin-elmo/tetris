import { expect, it } from 'vitest';
import { createGame, step } from '../../../../packages/engine/src/index';
import { PROJECT_DEFAULT as rules } from '../../../../packages/rulesets/src/index';
import { placementWarning } from './danger';

it('marks the exact next spawn when a placement blocks it without changing the game', () => {
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 36 };
  state.queue[0] = 'O';
  state.board[19 * 10 + 4] = 8;
  const before = structuredClone(state);
  const warning = placementWarning(state, rules);
  expect(warning.reason).toBe('block-out');
  expect(warning.spawnCells).toContainEqual([4, 19]);
  expect(state).toEqual(before);
  expect(step(state, { hard: true }, rules).state.topoutReason).toBe(warning.reason);
});

it('warns before a piece locks entirely above the visible field', () => {
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 18 };
  state.board[20 * 10 + 1] = 8;
  const warning = placementWarning(state, rules);
  expect(warning.reason).toBe('lock-out');
  expect(warning.landingCells.every(([, y]) => y < rules.hiddenHeight)).toBe(true);
});

it('allows a line clear that rescues a piece above the field and checks its delayed spawn', () => {
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 18 };
  state.queue[0] = 'I';
  for (let x = 0; x < 10; x++) if (x !== 1 && x !== 2) state.board[19 * 10 + x] = 8;
  state.board[20 * 10 + 1] = 8;
  expect(placementWarning(state, rules).reason).toBeNull();
});

it('includes active garbage overflow but ignores packets still in transit', () => {
  const state = createGame(1);
  state.active = { kind: 'O', rotation: 0, x: 0, y: 36 };
  state.board[0] = 8;
  state.garbage.push({
    id: 'p',
    sourceId: 'b',
    targetId: 'a',
    lines: 1,
    createdTick: 0,
    arrivalTick: 0,
    holes: [9],
    status: 'active',
  });
  expect(placementWarning(state, rules).reason).toBe('garbage-out');
  state.garbage[0].arrivalTick = 600;
  expect(placementWarning(state, rules).reason).toBeNull();
});

it('does not warn for an ordinary empty-board placement', () => {
  expect(placementWarning(createGame(1), rules)).toMatchObject({ nearTop: false, reason: null });
});
