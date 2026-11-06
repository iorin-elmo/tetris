import { it, expect } from 'vitest';
import { PROJECT_DEFAULT as r } from '../../rulesets/src/index';
import { distribute, targets, winner, garbagePacket, type Combatant } from './battle';
const p = (id: string, team: number, alive = true): Combatant => ({
  id,
  team,
  alive,
  danger: 0,
  ko: 0,
  target: null,
});
it('preserves total attack including rotated remainders', () => {
  for (let count = 1; count <= 9; count++)
    for (let lines = 0; lines < 100; lines++)
      expect(
        Object.values(
          distribute(
            lines,
            Array.from({ length: count }, (_, i) => String(i)),
            5,
          ),
        ).reduce((a, b) => a + b, 0),
      ).toBe(lines);
  expect(Object.values(distribute(5, ['a', 'b', 'c'], 0))).toEqual([2, 2, 1]);
});
it('every targeting mode excludes teammates, self and KO', () => {
  for (const targeting of ['manual', 'random', 'all_equal', 'attackers', 'danger', 'badges_like'] as const) {
    const a = { ...p('a', 0), target: 'b' };
    expect(
      targets(a, [a, p('b', 0), p('c', 1, false), p('d', 1)], { ...r, mode: 'team', targeting }, 3).targets,
    ).toEqual(['d']);
  }
});
it('losing one teammate does not lose the team', () => {
  expect(winner([p('a', 0), p('b', 0, false), p('c', 1)], { ...r, mode: 'team' }).finished).toBe(false);
  expect(winner([p('a', 0), p('b', 0), p('c', 1, false)], { ...r, mode: 'team' }).winners).toEqual([
    'a',
    'b',
  ]);
});
it('generates reproducible packet holes, constant per packet in PPT2', () => {
  const g = garbagePacket('a', 'b', 'c', 10, 0, r, 12);
  expect(new Set(g.packet.holes).size).toBe(1);
  expect(g).toEqual(garbagePacket('a', 'b', 'c', 10, 0, r, 12));
});
