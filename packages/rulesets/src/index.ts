import { z } from 'zod';
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const attack = int(0, 100);
export const attackSchema = z.object({
  single: attack.default(0), double: attack.default(1), triple: attack.default(2), tetris: attack.default(4),
  tSpinZero: attack.default(0), tSpinMiniZero: attack.default(0), tSpinMiniSingle: attack.default(0), tSpinMiniDouble: attack.default(1),
  tSpinSingle: attack.default(2), tSpinDouble: attack.default(4), tSpinTriple: attack.default(6),
  perfectClear: attack.default(10), perfectClearPolicy: z.enum(['replace-base', 'add-to-base']).default('replace-base'),
  b2bBonus: attack.default(1), renBonus: z.array(attack).min(1).max(64).default([0,0,1,1,2,2,3,3,4,4,4,4,4,5]),
  enableNonTSpinBonus: z.boolean().default(false), nonTSpinBonuses: z.record(z.string(), attack).default({}),
}).strict();
export const rulesSchema = z.object({
  ruleVersion: z.literal('stacklane-project-1').default('stacklane-project-1'),
  maxPlayers: int(2,10).default(10), mode: z.enum(['ffa','team']).default('ffa'), teamCount: int(1,4).default(2),
  maxPlayersPerTeam: int(1,6).default(6), fieldWidth: int(5,20).default(10), visibleHeight: int(16,30).default(20), hiddenHeight: int(4,30).default(20),
  nextCount: int(1,10).default(5), holdEnabled: z.boolean().default(true), forceGhost: z.boolean().default(false),
  gravityTicks: int(1,3600).default(60), softDropFactor: int(1,100).default(20), lockDelayTicks: int(0,600).default(30), lockResetLimit: int(0,100).default(15),
  entryDelayTicks: int(0,120).default(0), lineClearDelayTicks: int(0,120).default(6),
  garbageStyle: z.enum(['ppt2','tetrio']).default('ppt2'), garbageTravelTicks: int(0,600).default(30), garbageActivationTicks: int(0,600).default(0), garbageCapPerLock: int(1,40).default(8),
  messiness: z.number().min(0).max(1).default(0.25), blockingMode: z.enum(['clear','none']).default('clear'), passthrough: z.literal(false).default(false),
  targeting: z.enum(['manual','random','all_equal','attackers','danger','badges_like']).default('manual'), targetRefreshTicks: int(1,3600).default(300),
  attackProfile: z.enum(['ppt2','custom']).default('ppt2'), attackRules: attackSchema.default(() => attackSchema.parse({})),
  inputPolicy: z.enum(['free','restricted','locked']).default('free'), dasMs: int(0,500).default(150), arrMs: int(0,200).default(30),
  dasBounds: z.tuple([int(0,500),int(0,500)]).default([0,500]), arrBounds: z.tuple([int(0,200),int(0,200)]).default([0,200]),
  requireReady: z.boolean().default(false), allowSpectators: z.boolean().default(true), allowLateJoinAsSpectator: z.boolean().default(true),
  inputDelayTicks: int(0,12).default(0),
}).strict().refine(r => r.dasBounds[0] <= r.dasBounds[1] && r.arrBounds[0] <= r.arrBounds[1], '入力範囲の下限は上限以下にしてください');
export type Rules = z.infer<typeof rulesSchema>;
export type AttackRules = z.infer<typeof attackSchema>;
// Timings, mini-spin exceptions and garbage details are PROJECT_DEFAULT; not measured original values.
export const PROJECT_DEFAULT: Rules = rulesSchema.parse({});
export function inputTiming(rules: Rules, dasMs: number, arrMs: number) {
  const clamp = (n: number, b: [number, number]) => Math.min(b[1], Math.max(b[0], n));
  return rules.inputPolicy === 'locked' ? { dasMs: rules.dasMs, arrMs: rules.arrMs } : rules.inputPolicy === 'restricted'
    ? { dasMs: clamp(dasMs, rules.dasBounds), arrMs: clamp(arrMs, rules.arrBounds) } : { dasMs, arrMs };
}
