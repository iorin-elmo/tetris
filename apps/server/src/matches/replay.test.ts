import { it, expect } from 'vitest';
import { Match } from './match';
import { replayMatch, type ReplayEntry } from './replay';
import { PROJECT_DEFAULT } from '../../../../packages/rulesets/src/index';
import { checksum } from '../../../../packages/engine/src/index';
it('replays private seeds, inputs, targeting and a disconnect to the identical complete state', () => {
  const match = new Match(
      ['a', 'b'].map((id) => ({ id, name: id, team: 0, dasMs: 150, arrMs: 30 })),
      PROJECT_DEFAULT,
      0,
    ),
    archive = match.archive(),
    entries: ReplayEntry[] = [];
  for (let i = 0; i < 400 && !match.finished; i++) {
    for (const p of match.players) {
      const frames = [
        { tick: match.tick + 1, seq: i, input: { hard: i % 18 === 0, left: i % 90 < 20, cw: i % 49 === 0 } },
      ];
      p.queue.push(...frames);
      entries.push({ tick: match.tick, playerId: p.id, data: { kind: 'input', frames } });
    }
    if (i === 100) {
      match.release('a');
      entries.push({ tick: match.tick, playerId: 'a', data: { kind: 'disconnect' } });
    }
    if (i === 120) {
      match.release('b');
      entries.push({ tick: match.tick, playerId: 'b', data: { kind: 'input.reset' } });
    }
    match.advance();
  }
  const replay = replayMatch(archive, entries, match.tick);
  expect(replay.players.map((p) => checksum(p.state))).toEqual(match.players.map((p) => checksum(p.state)));
  expect(replay.standings()).toEqual(match.standings());
});
it('restores the initial private random-target RNG exactly', () => {
  const match = new Match(
    ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, team: 0, dasMs: 150, arrMs: 30 })),
    { ...PROJECT_DEFAULT, targeting: 'random' },
    0,
  );
  const restored = Match.restore(match.archive());
  expect(restored.rng).toBe(match.rng);
  expect(restored.players.map((p) => p.target)).toEqual(match.players.map((p) => p.target));
});
