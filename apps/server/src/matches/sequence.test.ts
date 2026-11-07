import { expect, it } from 'vitest';
import { Match } from './match';
import { PROJECT_DEFAULT } from '../../../../packages/rulesets/src/index';
import { bag } from '../../../../packages/engine/src/index';

const roster = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  name: `P${i}`,
  team: i < 6 ? 0 : 1,
  dasMs: i * 10,
  arrMs: i,
}));

it.each(['ffa', 'team'] as const)(
  'uses the same full piece sequence for all ten %s players with independent input timing',
  (mode) => {
    const match = new Match(roster, { ...PROJECT_DEFAULT, mode, sharedSequence: true }, 0);
    const first = match.players[0].state;
    for (const p of match.players) {
      expect(p.state.active?.kind).toBe(first.active?.kind);
      expect(p.state.queue).toEqual(first.queue);
      expect(p.state.rng).toBe(first.rng);
      let seed = p.state.rng;
      let expected = first.rng;
      for (let i = 0; i < 50; i++) {
        const actualBag = bag(seed),
          expectedBag = bag(expected);
        expect(actualBag.pieces).toEqual(expectedBag.pieces);
        seed = actualBag.seed;
        expected = expectedBag.seed;
      }
    }
    const restored = Match.restore(match.archive());
    expect(restored.players.map((p) => p.state)).toEqual(match.players.map((p) => p.state));
    expect(restored.rules.sharedSequence).toBe(true);
    expect(match.players[0].rules.dasMs).not.toBe(match.players[1].rules.dasMs);
  },
);

it('uses a separate seed for each player by default', () => {
  const match = new Match(roster, PROJECT_DEFAULT, 0);
  expect(new Set(Object.values(match.seeds)).size).toBe(10);
  expect(new Set(match.players.map((p) => p.state.queue.join(''))).size).toBeGreaterThan(1);
});
