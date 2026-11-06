import { describe, it, expect } from 'vitest';
import { PROJECT_DEFAULT as r, rulesSchema } from '../../rulesets/src/index';
import {
  createGame,
  step,
  bag,
  PIECES,
  rotate,
  kicks,
  attackFor,
  receiveGarbage,
  checksum,
  SHAPES,
  detectSpin,
} from './index';
describe('deterministic field engine', () => {
  it('has one of every piece in each seeded bag', () => {
    let seed = 123;
    for (let i = 0; i < 100; i++) {
      const b = bag(seed);
      expect([...b.pieces].sort()).toEqual([...PIECES].sort());
      seed = b.seed;
    }
  });
  it('replays the same inputs without mutating the previous state', () => {
    let a = createGame(12),
      b = createGame(12);
    const initial = structuredClone(a);
    for (let tick = 0; tick < 800; tick++) {
      const input = {
        left: tick % 17 < 3,
        cw: tick % 13 === 0,
        hard: tick % 47 === 0,
        hold: tick % 117 === 0,
      };
      a = step(a, input).state;
      b = step(b, input).state;
    }
    expect(checksum(a)).toBe(checksum(b));
    expect(createGame(12)).toEqual(initial);
  });
  for (const kind of PIECES)
    for (const direction of [1, -1] as const)
      it(`${kind}: all four ${direction} rotation transitions`, () => {
        const s = createGame(1);
        s.active = { kind, x: 3, y: 25, rotation: 0 };
        for (let i = 0; i < 4; i++) {
          expect(rotate(s, direction, r)).toBe(true);
          expect(SHAPES[kind][s.active!.rotation]).toHaveLength(4);
        }
        expect(s.active!.rotation).toBe(0);
      });
  it('kicks a T away from the left wall and I away from the floor', () => {
    const t = createGame(1);
    t.active = { kind: 'T', x: -1, y: 30, rotation: 1 };
    expect(rotate(t, -1, r)).toBe(true);
    expect(t.active!.x).toBe(0);
    const i = createGame(1);
    i.active = { kind: 'I', x: 3, y: 38, rotation: 0 };
    expect(rotate(i, 1, r)).toBe(true);
    expect(i.active!.y).toBeLessThan(38);
    expect(kicks('I', 0, 1)).not.toEqual(kicks('T', 0, 1));
  });
  it('rejects a rotation inside a full obstruction', () => {
    const s = createGame(1);
    s.board.fill(8);
    s.active = { kind: 'T', x: 3, y: 25, rotation: 0 };
    expect(rotate(s, 1, r)).toBe(false);
  });
  it('allows hold once per lock and keeps all requested next pieces', () => {
    let s = createGame(1);
    const initial = s.active!.kind;
    s = step(s, { hold: true }).state;
    expect(s.hold).toBe(initial);
    const held = s.active!.kind;
    s = step(s, { hold: true }).state;
    expect(s.active!.kind).toBe(held);
    s = step(s, { hard: true }).state;
    expect(s.holdUsed).toBe(false);
    expect(s.queue.length).toBeGreaterThanOrEqual(5);
  });
  it('buffers initial hold and rotation during entry delay', () => {
    const config = { ...r, entryDelayTicks: 3 };
    let s = step(createGame(3), { hard: true }, config).state;
    expect(s.active).toBeNull();
    s = step(s, { hold: true, cw: true }, config).state;
    s = step(s, {}, config).state;
    s = step(s, {}, config).state;
    expect(s.hold).not.toBeNull();
    expect(s.holdUsed).toBe(true);
    expect(s.active!.rotation).toBe(1);
  });
  it('clears four lines and replaces base with perfect clear 10', () => {
    let s = createGame(2);
    for (let y = 36; y < 40; y++) for (let x = 0; x < 10; x++) s.board[y * 10 + x] = x === 5 ? 0 : 8;
    s.active = { kind: 'I', x: 3, y: 36, rotation: 1 };
    const result = step(s, { hard: true });
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'lock', lines: 4, perfectClear: true, attack: 10 }),
    );
    expect(result.state.board.every((v) => !v)).toBe(true);
  });
  it('handles DAS=0/ARR=0 and last-pressed direction', () => {
    const config = rulesSchema.parse({ dasMs: 0, arrMs: 0 });
    let s = step(createGame(1), { left: true }, config).state;
    expect(Math.min(...SHAPES[s.active!.kind][0].map(([x]) => x + s.active!.x))).toBe(0);
    s = step(s, { left: true, right: true }, config).state;
    expect(s.horizontal.direction).toBe(1);
  });
  it('recognizes full and mini T spins only after rotation', () => {
    const s = createGame(1);
    s.active = { kind: 'T', x: 3, y: 37, rotation: 0 };
    for (const [x, y] of [
      [3, 37],
      [5, 37],
      [3, 39],
    ])
      s.board[y * 10 + x] = 8;
    expect(detectSpin(s, r)).toBe('none');
    s.lastRotation = { kick: 0 };
    expect(detectSpin(s, r)).toBe('full');
    s.board[37 * 10 + 5] = 0;
    s.board[39 * 10 + 5] = 8;
    expect(detectSpin(s, r)).toBe('mini');
    s.lastRotation = { kick: 4 };
    expect(detectSpin(s, r)).toBe('full');
  });
  it('topouts when the spawn is blocked', () => {
    let s = createGame(1);
    s.board.fill(8, 17 * 10, 22 * 10);
    s.active = { kind: 'O', x: 3, y: 36, rotation: 0 };
    s = step(s, { hard: true }).state; // full rows are cleared, so use sparse blockers instead
    s = createGame(1);
    for (let y = 17; y < 22; y++) for (let x = 0; x < 10; x += 2) s.board[y * 10 + x] = 8;
    s.active = { kind: 'O', x: 3, y: 36, rotation: 0 };
    expect(step(s, { hard: true }).state.alive).toBe(false);
  });
});
describe('PPT2 attack fixture / PROJECT_DEFAULT exceptions', () => {
  const a = r.attackRules;
  it.each([
    [1, 'none', 0],
    [4, 'none', 4],
    [2, 'full', 4],
    [3, 'full', 6],
  ] as const)('%s %s gives %s', (lines, spin, value) =>
    expect(attackFor(lines, spin, false, false, 0, a).attack).toBe(value),
  );
  it('starts B2B on the first difficult clear, bonuses only the second; regular single breaks it', () => {
    expect(attackFor(4, 'none', false, false, 0, a).attack).toBe(4);
    expect(attackFor(4, 'none', false, true, 0, a).attack).toBe(5);
    expect(attackFor(1, 'none', false, true, 0, a).b2b).toBe(false);
    expect(attackFor(0, 'none', false, true, 0, a).b2b).toBe(true);
  });
  it('fixes every REN boundary from zero to fifteen', () => {
    const expected = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5];
    expected.forEach((n, ren) =>
      expect(attackFor(1, 'none', false, false, ren, a)).toMatchObject({ attack: n, ren }),
    );
    expect(attackFor(4, 'none', true, true, 15, a).attack).toBe(10);
  });
  it('uses edited attack values and retains mini-specific event values', () => {
    expect(attackFor(2, 'full', false, false, 0, { ...a, tSpinDouble: 13 }).attack).toBe(13);
    expect(attackFor(1, 'mini', false, false, 0, a).attack).toBe(a.tSpinMiniSingle);
  });
  it.each(['ppt2', 'tetrio'] as const)(
    '%s: cancels before sending and does not insert on a clear',
    (style) => {
      const config = { ...r, garbageStyle: style };
      let s = createGame(1);
      for (let y = 36; y < 40; y++) for (let x = 0; x < 10; x++) s.board[y * 10 + x] = x === 5 ? 0 : 8;
      s.board[35 * 10] = 8;
      s.active = { kind: 'I', x: 3, y: 36, rotation: 1 };
      s = receiveGarbage(s, {
        id: 'a',
        sourceId: 'other',
        targetId: 'me',
        lines: 3,
        createdTick: 0,
        arrivalTick: 0,
        holes: [1, 1, 1],
        status: 'pending',
      });
      const out = step(s, { hard: true }, config);
      expect(out.events).toContainEqual(
        expect.objectContaining({ generated: 4, cancelled: 3, attack: 1, inserted: 0 }),
      );
      expect(out.state.garbage).toHaveLength(0);
    },
  );
  it('inserts arrived garbage FIFO after a nonclear and obeys the cap', () => {
    let s = createGame(1);
    s = receiveGarbage(s, {
      id: 'a',
      sourceId: 'x',
      targetId: 'y',
      lines: 10,
      createdTick: 0,
      arrivalTick: 0,
      holes: Array(10).fill(2),
      status: 'pending',
    });
    const out = step(s, { hard: true });
    expect(out.state.stats.receivedGarbage).toBe(8);
    expect(out.state.garbage[0].lines).toBe(2);
    expect(out.state.board.slice(-10)).toEqual([8, 8, 0, 8, 8, 8, 8, 8, 8, 8]);
  });
});
