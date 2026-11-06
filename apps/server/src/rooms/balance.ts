import { random } from '../../../../packages/engine/src/index';
import type { Skill } from '../../../../packages/protocol/src/index';
export function estimateSkills(players: { id: string; skill: Skill }[]): Record<string, Skill> {
  const known = players.filter((p) => p.skill.matches > 0),
    keys = ['pps', 'apm', 'app'] as const;
  const median = (a: number[]) => {
    const s = [...a].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const centers = keys.map((key, i) =>
    known.length ? median(known.map((p) => p.skill[key])) : [1, 30, 0.5][i],
  );
  const spreads = keys.map((key, i) =>
    Math.max([0.5, 15, 0.25][i], 1.4826 * median(known.map((p) => Math.abs(p.skill[key] - centers[i])))),
  );
  return Object.fromEntries(
    players.map((p) => {
      const z = keys.map((key, i) => Math.max(-3, Math.min(3, (p.skill[key] - centers[i]) / spreads[i])));
      const raw = 0.35 * z[0] + 0.45 * z[1] + 0.2 * z[2],
        confidence = Math.min(1, p.skill.matches / 10);
      return [p.id, { ...p.skill, value: Math.max(0.1, 1 + 0.35 * raw * confidence), confidence }];
    }),
  );
}
export interface BalanceCandidate {
  assignments: Record<string, number>;
  score: number;
  teams: { team: number; skill: number; count: number; confidence: number }[];
}
export function balance(
  players: { id: string; skill: Skill }[],
  teamCount: number,
  cap: number,
  seed: number,
  headcountPenalty = 0.05,
): BalanceCandidate[] {
  if (
    teamCount < 2 ||
    teamCount > 4 ||
    players.length < 2 ||
    players.length > 10 ||
    teamCount * cap < players.length
  )
    throw new Error('Invalid team constraints');
  const order = [...players].sort((a, b) => b.skill.value - a.skill.value || a.id.localeCompare(b.id));
  type Node = {
    assignments: Record<string, number>;
    sums: number[];
    counts: number[];
    uncertainty: number[];
    confidence: number[];
    score: number;
  };
  const objective = (sums: number[], counts: number[], uncertainty: number[]) => {
    const mean = sums.reduce((a, b) => a + b, 0) / teamCount,
      meanN = counts.reduce((a, b) => a + b, 0) / teamCount,
      meanU = uncertainty.reduce((a, b) => a + b, 0) / teamCount;
    return sums.reduce(
      (score, sum, t) =>
        score +
        (sum - mean) ** 2 +
        0.1 * (uncertainty[t] - meanU) ** 2 +
        headcountPenalty * (counts[t] - meanN) ** 2,
      0,
    );
  };
  let beam: Node[] = [
    {
      assignments: {},
      sums: Array(teamCount).fill(0),
      counts: Array(teamCount).fill(0),
      uncertainty: Array(teamCount).fill(0),
      confidence: Array(teamCount).fill(0),
      score: 0,
    },
  ];
  for (const p of order) {
    let roll: number;
    [seed, roll] = random(seed);
    const rotation = Math.floor(roll * teamCount),
      next: Node[] = [];
    for (const node of beam)
      for (let i = 0; i < teamCount; i++) {
        const t = (i + rotation) % teamCount;
        if (node.counts[t] >= cap) continue;
        const sums = [...node.sums],
          counts = [...node.counts],
          uncertainty = [...node.uncertainty],
          confidence = [...node.confidence];
        sums[t] += p.skill.value;
        counts[t]++;
        uncertainty[t] += 1 - p.skill.confidence;
        confidence[t] += p.skill.confidence;
        next.push({
          assignments: { ...node.assignments, [p.id]: t },
          sums,
          counts,
          uncertainty,
          confidence,
          score: objective(sums, counts, uncertainty),
        });
      }
    next.sort((a, b) => a.score - b.score);
    beam = next.slice(0, 512);
  }
  return beam
    .filter((n) => n.counts.filter(Boolean).length >= 2)
    .slice(0, 3)
    .map((n) => ({
      assignments: n.assignments,
      score: n.score,
      teams: n.sums.map((skill, team) => ({
        team,
        skill,
        count: n.counts[team],
        confidence: n.counts[team] ? n.confidence[team] / n.counts[team] : 0,
      })),
    }));
}
