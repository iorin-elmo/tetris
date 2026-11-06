import { type Rules, type AttackRules, PROJECT_DEFAULT } from '../../rulesets/src/index';
import { bag, kicks, PIECES, SHAPES, type Piece } from './pieces';
export { bag, random, SHAPES, PIECES, kicks } from './pieces';
export type { Piece } from './pieces';
export interface Active { kind: Piece; x: number; y: number; rotation: number }
export interface Input { left?: boolean; right?: boolean; soft?: boolean; hard?: boolean; cw?: boolean; ccw?: boolean; hold?: boolean }
export interface GarbagePacket { id: string; sourceId: string; targetId: string; lines: number; createdTick: number; arrivalTick: number; holes: number[]; status: 'pending'|'active' }
export type Spin = 'none'|'mini'|'full';
export interface Stats { placements: number; linesCleared: number; attackGenerated: number; attackSent: number; attackCancelled: number; receivedGarbage: number; score: number }
export interface GameState {
  board: number[]; active: Active | null; queue: Piece[]; rng: number; hold: Piece | null; holdUsed: boolean;
  tick: number; alive: boolean; gravity: number; grounded: number; resets: number; delay: number;
  lastRotation: { kick: number } | null; lastGarbageSource: string|null; streak: number; b2b: boolean; garbage: GarbagePacket[]; stats: Stats;
  horizontal: { direction: number; held: number; repeat: number; left: boolean; right: boolean };
}
export interface LockEvent { type: 'lock'; piece: Piece; lines: number; spin: Spin; perfectClear: boolean; ren: number; b2b: boolean; generated: number; attack: number; cancelled: number; inserted: number }
export type GameEvent = LockEvent | { type: 'topout' } | { type: 'hold' } | { type: 'rotate' };
export function cells(active: Active) { return SHAPES[active.kind][active.rotation].map(([x,y]) => [active.x+x,active.y+y] as const); }
export function fits(state: Pick<GameState,'board'>, active: Active, r: Rules = PROJECT_DEFAULT): boolean {
  return cells(active).every(([x,y]) => x >= 0 && x < r.fieldWidth && y >= 0 && y < r.visibleHeight+r.hiddenHeight && !state.board[y*r.fieldWidth+x]);
}
export function ghost(state: GameState, r: Rules = PROJECT_DEFAULT): Active | null {
  if (!state.active) return null;
  let a = { ...state.active };
  while (fits(state,{ ...a, y: a.y+1 },r)) a.y++;
  return a;
}
function fillQueue(s: GameState, r: Rules) {
  while (s.queue.length < r.nextCount+7) { const b = bag(s.rng); s.rng = b.seed; s.queue.push(...b.pieces); }
}
function spawn(s: GameState, r: Rules, kind?: Piece) {
  fillQueue(s,r);
  s.active = { kind: kind ?? s.queue.shift()!, x: Math.floor(r.fieldWidth/2)-2, y: r.hiddenHeight-2, rotation: 0 };
  s.gravity = 0; s.grounded = 0; s.resets = 0; s.lastRotation = null;
  fillQueue(s,r);
  if (!fits(s,s.active,r)) { s.alive = false; s.active = null; }
}
export function createGame(seed: number, r: Rules = PROJECT_DEFAULT): GameState {
  const s: GameState = { board: Array(r.fieldWidth*(r.visibleHeight+r.hiddenHeight)).fill(0), active: null, queue: [], rng: seed >>> 0,
    hold: null, holdUsed: false, tick: 0, alive: true, gravity: 0, grounded: 0, resets: 0, delay: 0, lastRotation: null, lastGarbageSource: null, streak: 0, b2b: false, garbage: [],
    horizontal: { direction: 0, held: 0, repeat: 0, left: false, right: false },
    stats: { placements: 0, linesCleared: 0, attackGenerated: 0, attackSent: 0, attackCancelled: 0, receivedGarbage: 0, score: 0 } };
  spawn(s,r); return s;
}
export function rotate(s: GameState, direction: 1|-1, r: Rules): boolean {
  if (!s.active) return false;
  const a = s.active, to = (a.rotation+direction+4)%4;
  const offsets = kicks(a.kind,a.rotation,to);
  for (let i = 0; i < offsets.length; i++) {
    const [x,y] = offsets[i], next = { ...a, x: a.x+x, y: a.y+y, rotation: to };
    if (fits(s,next,r)) { s.active = next; s.lastRotation = { kick: i }; return true; }
  }
  return false;
}
export function detectSpin(s: GameState, r: Rules): Spin {
  const a = s.active;
  if (!a || a.kind !== 'T' || !s.lastRotation) return 'none';
  const occupied = (dx: number,dy: number) => {
    const x = a.x+dx, y = a.y+dy;
    return x < 0 || x >= r.fieldWidth || y < 0 || y >= r.visibleHeight+r.hiddenHeight || !!s.board[y*r.fieldWidth+x];
  };
  const corners = [occupied(0,0),occupied(2,0),occupied(2,2),occupied(0,2)];
  if (corners.filter(Boolean).length < 3) return 'none';
  const front = [[0,1],[1,2],[2,3],[3,0]][a.rotation];
  return corners[front[0]] && corners[front[1]] || s.lastRotation.kick === 4 ? 'full' : 'mini';
}
export function attackFor(lines: number, spin: Spin, perfectClear: boolean, previousB2b: boolean, streak: number, a: AttackRules) {
  const difficult = lines > 0 && (lines === 4 || spin !== 'none'); // Mini exceptions: PROJECT_DEFAULT.
  const b2b = lines ? difficult : previousB2b;
  const ren = lines ? streak : -1;
  let base = spin === 'full' ? [a.tSpinZero,a.tSpinSingle,a.tSpinDouble,a.tSpinTriple][lines] ?? 0
    : spin === 'mini' ? [a.tSpinMiniZero,a.tSpinMiniSingle,a.tSpinMiniDouble][lines] ?? 0
      : [0,a.single,a.double,a.triple,a.tetris][lines] ?? 0;
  if (perfectClear && a.perfectClearPolicy === 'replace-base') return { attack: a.perfectClear, b2b, ren, bonus: previousB2b && difficult };
  if (perfectClear) base += a.perfectClear;
  const bonus = previousB2b && difficult;
  return { attack: base + (bonus ? a.b2bBonus : 0) + (lines ? a.renBonus[Math.min(ren,a.renBonus.length-1)] : 0), b2b, ren, bonus };
}
function lock(s: GameState, r: Rules, events: GameEvent[]) {
  const active = s.active!;
  const spin = detectSpin(s,r), lockedCells = cells(active);
  for (const [x,y] of lockedCells) s.board[y*r.fieldWidth+x] = PIECES.indexOf(active.kind)+1;
  const rows: number[][] = [];
  for (let y = 0; y < r.hiddenHeight+r.visibleHeight; y++) rows.push(s.board.slice(y*r.fieldWidth,(y+1)*r.fieldWidth));
  const kept = rows.filter(row => row.some(v => v === 0));
  const lines = rows.length-kept.length;
  s.board = [...Array(lines*r.fieldWidth).fill(0), ...kept.flat()];
  const pc = lines > 0 && s.board.every(v => v === 0);
  const fire = attackFor(lines,spin,pc,s.b2b,s.streak,r.attackRules);
  s.b2b = fire.b2b; s.streak = lines ? s.streak+1 : 0;
  let attack = fire.attack, cancelled = 0;
  for (const p of s.garbage) {
    const n = Math.min(attack,p.lines); p.lines -= n; p.holes.splice(0,n); attack -= n; cancelled += n;
  }
  s.garbage = s.garbage.filter(p => p.lines > 0);
  let inserted = 0, overflow = false;
  const blocked = r.garbageStyle === 'ppt2' ? lines > 0 : r.blockingMode === 'clear' && lines > 0;
  if (!blocked) {
    for (const p of s.garbage) {
      if (p.arrivalTick + (r.garbageStyle === 'tetrio' ? r.garbageActivationTicks : 0) > s.tick) continue;
      p.status = 'active';
      const n = Math.min(p.lines,r.garbageCapPerLock-inserted);
      if (n > 0) s.lastGarbageSource = p.sourceId;
      for (let i = 0; i < n; i++) {
        if (s.board.slice(0,r.fieldWidth).some(Boolean)) overflow = true;
        s.board.splice(0,r.fieldWidth);
        const hole = p.holes.shift()!;
        s.board.push(...Array.from({length:r.fieldWidth},(_,x) => x === hole ? 0 : 8));
      }
      p.lines -= n; inserted += n;
      if (inserted >= r.garbageCapPerLock) break;
    }
  }
  s.garbage = s.garbage.filter(p => p.lines > 0);
  s.stats.placements++; s.stats.linesCleared += lines; s.stats.attackGenerated += fire.attack;
  s.stats.attackCancelled += cancelled; s.stats.attackSent += attack; s.stats.receivedGarbage += inserted;
  const level = 1+Math.floor((s.stats.linesCleared-lines)/10);
  s.stats.score += (pc ? 3500 : spin === 'full' ? [400,800,1200,1600][lines] ?? 0 : [0,100,300,500,800][lines] ?? 0) * level * (fire.bonus ? 1.5 : 1) + Math.max(0,fire.ren)*50*level;
  events.push({type:'lock',piece:active.kind,lines,spin,perfectClear:pc,ren:fire.ren,b2b:fire.bonus,generated:fire.attack,attack,cancelled,inserted});
  s.active = null; s.holdUsed = false;
  if (overflow || lockedCells.every(([,y]) => y < r.hiddenHeight) && lines === 0) { s.alive = false; events.push({type:'topout'}); return; }
  s.delay = r.entryDelayTicks + (lines ? r.lineClearDelayTicks : 0);
  if (!s.delay) { spawn(s,r); if (!s.alive) events.push({type:'topout'}); }
}
export function step(state: GameState, input: Input = {}, r: Rules = PROJECT_DEFAULT): { state: GameState; events: GameEvent[] } {
  const s = structuredClone(state), events: GameEvent[] = [];
  if (!s.alive) return {state:s,events};
  s.tick++;
  if (!s.active) {
    if (--s.delay <= 0) {
      spawn(s,r);
      // One-tick initial rotation/hold input is accepted on the spawn tick.
      if (!s.alive) events.push({type:'topout'});
    }
    if (!s.active) return {state:s,events};
  }
  if (input.hold && r.holdEnabled && !s.holdUsed) {
    const kind = s.active.kind, previous = s.hold; s.hold = kind; spawn(s,r,previous ?? undefined); s.holdUsed = true; events.push({type:'hold'});
    if (!s.alive) { events.push({type:'topout'}); return {state:s,events}; }
  }
  const wasGrounded = !fits(s,{...s.active!,y:s.active!.y+1},r);
  let manipulated = false;
  if (input.cw || input.ccw) { manipulated = rotate(s,input.cw ? 1 : -1,r); if (manipulated) events.push({type:'rotate'}); }
  const h = s.horizontal;
  let direction = input.left && input.right ? (!h.right ? 1 : !h.left ? -1 : h.direction) : input.right ? 1 : input.left ? -1 : 0;
  const move = () => {
    const next = {...s.active!,x:s.active!.x+direction};
    if (fits(s,next,r)) { s.active = next; s.lastRotation = null; manipulated = true; return true; }
    return false;
  };
  const das = Math.round(r.dasMs*60/1000), arr = Math.round(r.arrMs*60/1000);
  if (!direction) { h.held = 0; h.repeat = 0; }
  else {
    if (direction !== h.direction) { h.held = 0; h.repeat = 0; move(); }
    else h.held++;
    if (h.held >= das) {
      if (arr === 0) { while (move()) { /* instant wall movement */ } }
      else if (h.held === das || ++h.repeat >= arr) { move(); h.repeat = 0; }
    }
  }
  h.direction = direction; h.left = !!input.left; h.right = !!input.right;
  if (wasGrounded && manipulated && s.resets < r.lockResetLimit) { s.grounded = 0; s.resets++; }
  if (input.hard) {
    const landing = ghost(s,r)!;
    const distance = landing.y-s.active!.y;
    if (distance > 0) s.lastRotation = null;
    s.stats.score += distance*2; s.active = landing; lock(s,r,events); return {state:s,events};
  }
  s.gravity += input.soft ? r.softDropFactor : 1;
  while (s.gravity >= r.gravityTicks) {
    s.gravity -= r.gravityTicks;
    if (!fits(s,{...s.active!,y:s.active!.y+1},r)) break;
    s.active!.y++;
    if (input.soft) { s.lastRotation = null; s.stats.score++; }
  }
  if (!fits(s,{...s.active!,y:s.active!.y+1},r)) {
    s.grounded++;
    if (s.grounded >= r.lockDelayTicks) lock(s,r,events);
  } else s.grounded = 0;
  return {state:s,events};
}
export function receiveGarbage(state: GameState, packet: GarbagePacket): GameState {
  const s = structuredClone(state);
  if (!s.garbage.some(p => p.id === packet.id)) s.garbage.push(structuredClone(packet));
  return s;
}
export function checksum(state: GameState): string {
  const text = JSON.stringify(state); let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i),16777619);
  return (n >>> 0).toString(16).padStart(8,'0');
}
export function statistics(s: GameState) {
  const seconds = s.tick/60, p = s.stats.placements;
  return {...s.stats,elapsedActiveSeconds:seconds,pps:seconds ? p/seconds : 0,apm:seconds ? s.stats.attackGenerated*60/seconds : 0,app:p ? s.stats.attackGenerated/p : 0};
}
