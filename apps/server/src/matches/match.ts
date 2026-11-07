import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createGame,
  step,
  receiveGarbage,
  statistics,
  checksum,
  type GameState,
  type Input,
} from '../../../../packages/engine/src/index';
import {
  targets,
  distribute,
  garbagePacket,
  danger,
  winner,
  type Combatant,
} from '../../../../packages/engine/src/battle';
import { inputTiming, type Rules } from '../../../../packages/rulesets/src/index';
import { publicState, type MatchFrame, type Standing } from '../../../../packages/protocol/src/index';
export interface MatchPlayer {
  id: string;
  name: string;
  team: number;
  state: GameState;
  rules: Rules;
  held: Input;
  queue: { tick: number; seq: number; input: Input }[];
  ackSeq: number;
  lastSeq: number;
  lastScheduledTick: number;
  ko: number;
  target: string | null;
  placement: number | null;
  hashes: Map<number, string>;
}
export interface MatchArchive {
  id: string;
  startAt: number;
  rules: Rules;
  seeds: Record<string, number>;
  battleSeed: number;
  roster: { id: string; name: string; team: number; dasMs: number; arrMs: number }[];
}
export class Match {
  id: string = randomUUID();
  rules: Rules;
  players: MatchPlayer[];
  seeds: Record<string, number> = {};
  commitment: string;
  startAt: number;
  tick = 0;
  finished = false;
  deathOrder: string[] = [];
  rng = randomBytes(4).readUInt32LE();
  packetCount = 0;
  private initialBattleSeed = this.rng;
  private teamDeaths: number[] = [];
  constructor(
    members: { id: string; name: string; team: number; dasMs: number; arrMs: number }[],
    rules: Rules,
    startAt: number,
  ) {
    this.rules = structuredClone(rules);
    this.startAt = startAt;
    const sharedSeed = randomBytes(4).readUInt32LE();
    this.players = members.map((m) => {
      const seed = this.rules.sharedSequence ? sharedSeed : randomBytes(4).readUInt32LE();
      this.seeds[m.id] = seed;
      const playerRules = { ...this.rules, ...inputTiming(rules, m.dasMs, m.arrMs) };
      return {
        id: m.id,
        name: m.name,
        team: m.team,
        state: createGame(seed, playerRules),
        rules: playerRules,
        held: {},
        queue: [],
        ackSeq: -1,
        lastSeq: -1,
        lastScheduledTick: 0,
        ko: 0,
        target: null,
        placement: null,
        hashes: new Map(),
      };
    });
    this.commitment = createHash('sha256').update(JSON.stringify(this.seeds)).digest('hex');
    this.initializeTargets();
  }
  private initializeTargets() {
    for (const p of this.players)
      p.target =
        this.players.find(
          (other) => other.id !== p.id && (this.rules.mode !== 'team' || other.team !== p.team),
        )?.id ?? null;
    if (this.rules.targeting === 'random')
      for (const p of this.players) {
        const choice = targets(
          { ...this.combatants().find((c) => c.id === p.id)!, target: null },
          this.combatants(),
          this.rules,
          this.rng,
        );
        this.rng = choice.seed;
        p.target = choice.targets[0] ?? null;
      }
  }
  combatants(): Combatant[] {
    return this.players.map((p) => ({
      id: p.id,
      team: p.team,
      alive: p.state.alive,
      danger: danger(p.state, this.rules),
      ko: p.ko,
      target: p.target,
    }));
  }
  archive(): MatchArchive {
    return {
      id: this.id,
      startAt: this.startAt,
      rules: this.rules,
      seeds: this.seeds,
      battleSeed: this.initialBattleSeed,
      roster: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        dasMs: p.rules.dasMs,
        arrMs: p.rules.arrMs,
      })),
    };
  }
  static restore(archive: MatchArchive) {
    const match = new Match(archive.roster, archive.rules, archive.startAt);
    match.id = archive.id;
    match.seeds = archive.seeds;
    match.rng = archive.battleSeed;
    match.initialBattleSeed = archive.battleSeed;
    match.commitment = createHash('sha256').update(JSON.stringify(match.seeds)).digest('hex');
    for (const p of match.players) p.state = createGame(archive.seeds[p.id], p.rules);
    match.initializeTargets();
    return match;
  }
  release(id: string) {
    const p = this.players.find((p) => p.id === id);
    if (p) {
      p.held = {};
      p.queue = [];
      p.lastSeq = p.ackSeq;
      p.lastScheduledTick = this.tick;
    }
  }
  advance() {
    if (this.finished) return [];
    this.tick++;
    const events: { kind: string; payload: Record<string, unknown> }[] = [],
      attacks: { id: string; lines: number }[] = [];
    for (const p of this.players) {
      const next = p.queue[0]?.tick <= this.tick ? p.queue.shift() : undefined;
      const input = next?.input ?? p.held;
      if (next) {
        p.ackSeq = next.seq;
        p.held = { left: input.left, right: input.right, soft: input.soft };
      }
      const out = step(p.state, input, p.rules);
      p.state = out.state;
      for (const e of out.events) {
        if (e.type === 'lock') {
          events.push({ kind: 'lock', payload: { playerId: p.id, ...e } });
          if (e.attack) attacks.push({ id: p.id, lines: e.attack });
        }
      }
    }
    const players = this.combatants();
    for (const attack of attacks) {
      const p = this.players.find((p) => p.id === attack.id)!;
      const choice = targets(
        players.find((c) => c.id === p.id)!,
        players,
        this.rules,
        this.rng,
      );
      this.rng = choice.seed;
      if (this.rules.targeting !== 'all_equal') p.target = choice.targets[0] ?? null;
      if (!choice.targets.length) p.state.stats.attackSent -= attack.lines;
      for (const [id, lines] of Object.entries(distribute(attack.lines, choice.targets, this.tick))) {
        if (!lines) continue;
        const target = this.players.find((p) => p.id === id)!;
        const packet = garbagePacket(
          `${this.id}-${this.packetCount++}`,
          p.id,
          id,
          lines,
          this.tick,
          this.rules,
          this.rng,
        );
        this.rng = packet.seed;
        target.state = receiveGarbage(target.state, packet.packet);
        events.push({
          kind: 'attack',
          payload: { sourceId: p.id, targetId: id, lines, arrivalTick: packet.packet.arrivalTick },
        });
      }
    }
    for (const p of this.players)
      if (!p.state.alive && !this.deathOrder.includes(p.id)) {
        this.deathOrder.push(p.id);
        p.placement = this.players.length - this.deathOrder.length + 1;
        const killer = this.players.find(
          (x) =>
            x.id === p.state.lastGarbageSource &&
            x.id !== p.id &&
            (this.rules.mode !== 'team' || x.team !== p.team),
        );
        if (killer) killer.ko++;
        events.push({ kind: 'ko', payload: { playerId: p.id, sourceId: killer?.id ?? null } });
      }
    for (const team of new Set(this.players.map((p) => p.team)))
      if (
        this.players.filter((p) => p.team === team).every((p) => !p.state.alive) &&
        !this.teamDeaths.includes(team)
      )
        this.teamDeaths.push(team);
    for (const p of this.players)
      if (
        p.state.alive &&
        !this.players.some(
          (t) =>
            t.id === p.target &&
            t.state.alive &&
            t.id !== p.id &&
            (this.rules.mode !== 'team' || t.team !== p.team),
        )
      ) {
        const choice = targets(
          { ...this.combatants().find((c) => c.id === p.id)!, target: null },
          this.combatants(),
          this.rules,
          this.rng,
        );
        this.rng = choice.seed;
        p.target = choice.targets[0] ?? null;
      }
    if (this.rules.targeting === 'random' && this.tick % this.rules.targetRefreshTicks === 0)
      for (const p of this.players) {
        const choice = targets(
          { ...players.find((x) => x.id === p.id)!, target: null },
          players,
          this.rules,
          this.rng,
        );
        this.rng = choice.seed;
        p.target = choice.targets[0] ?? null;
      }
    this.finished = winner(this.combatants(), this.rules).finished;
    if (this.tick % 6 === 0)
      for (const p of this.players) {
        p.hashes.set(p.state.tick, checksum(p.state));
        if (p.hashes.size > 30) p.hashes.delete(p.hashes.keys().next().value!);
      }
    return events;
  }
  frame(id: string): MatchFrame {
    const self = this.players.find((p) => p.id === id);
    return {
      matchId: this.id,
      tick: this.tick,
      rules: this.rules,
      startAt: this.startAt,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        state: publicState(p.state),
        ko: p.ko,
        target: p.target,
        placement: p.placement,
      })),
      self: self?.state ?? null,
      selfRules: self?.rules ?? null,
      ackSeq: self?.ackSeq ?? -1,
    };
  }
  standings(): Standing[] {
    const teamCount = new Set(this.players.map((p) => p.team)).size;
    return this.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        place: p.state.alive ? 1 : (p.placement ?? this.players.length),
        ...(this.rules.mode === 'team'
          ? {
              teamPlace: this.players.some((x) => x.team === p.team && x.state.alive)
                ? 1
                : teamCount - this.teamDeaths.indexOf(p.team),
            }
          : {}),
        ko: p.ko,
        stats: statistics(p.state),
      }))
      .sort((a, b) => a.place - b.place || a.id.localeCompare(b.id));
  }
}
