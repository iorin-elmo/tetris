import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { Match } from '../apps/server/src/matches/match';
import { PROJECT_DEFAULT } from '../packages/rulesets/src/index';
const count = 10,
  ticks = Number(process.argv[2] || 3600),
  timings: number[] = [];
const roster = Array.from({ length: count }, (_, i) => ({
  id: `p-${i}`,
  name: `PLAYER ${i}`,
  team: i % 2,
  dasMs: 150,
  arrMs: 30,
}));
let match = new Match(roster, { ...PROJECT_DEFAULT, targeting: 'all_equal' }, 0),
  bytes = 0,
  restarts = 0;
const cpu = process.cpuUsage(),
  started = performance.now();
for (let tick = 0; tick < ticks; tick++) {
  if (match.players.some((p) => !p.state.alive)) {
    match = new Match(roster, { ...PROJECT_DEFAULT, targeting: 'all_equal' }, 0);
    restarts++;
  }
  for (const [i, p] of match.players.entries())
    p.queue.push({
      tick: match.tick + 1,
      seq: tick,
      input: {
        left: tick % 120 < 20,
        right: tick % 120 > 60 && tick % 120 < 80,
        hard: (tick + i * 3) % 30 === 0,
        cw: (tick + i) % 60 === 0,
      },
    });
  const before = performance.now();
  match.advance();
  if (tick % 6 === 0)
    for (const p of match.players)
      bytes += Buffer.byteLength(JSON.stringify({ type: 'match.snapshot', ...match.frame(p.id) }));
  timings.push(performance.now() - before);
}
const elapsed = performance.now() - started,
  usage = process.cpuUsage(cpu);
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
      players: count,
      ticks,
      simulatedSeconds: ticks / 60,
      wallMs: elapsed,
      avgTickMs: timings.reduce((a, b) => a + b, 0) / ticks,
      p95TickMs: timings[Math.floor(ticks * 0.95)],
      p99TickMs: timings[Math.floor(ticks * 0.99)],
      logicBudgetMs: 1000 / 60,
      cpuMs: (usage.user + usage.system) / 1000,
      rssMiB: process.memoryUsage().rss / 1024 ** 2,
      snapshotKiBPerSimulatedSecond: bytes / 1024 / (ticks / 60),
      restarts,
      note: 'Synthetic engine+10Hz JSON serialization measurement on the reported hardware; excludes SQLite writes and live WebSocket/WAN traffic.',
    },
    null,
    2,
  ),
);
