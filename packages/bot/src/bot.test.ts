import { it, expect } from 'vitest';
import { createGame, step } from '../../engine/src/index';
import { PROJECT_DEFAULT as r } from '../../rulesets/src/index';
import { botInput, createBot, plan } from './index';
it('executes legal inputs for 1200 ticks and makes placements', () => {
  let s = createGame(88);
  const memory = createBot();
  for (let i = 0; i < 1200 && s.alive; i++) s = step(s, botInput(s, r, memory, 'normal'), r).state;
  expect(s.stats.placements).toBeGreaterThan(12);
  expect(s.board.every((v) => v >= 0 && v <= 8)).toBe(true);
});
it('is deterministic and deeper on hard', () => {
  const s = createGame(11);
  expect(plan(s, r, 'hard')).toEqual(plan(s, r, 'hard'));
  expect(plan(s, r, 'hard').depth).toBe(2);
});
