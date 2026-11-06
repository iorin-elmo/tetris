import { z } from 'zod';
export const actionNames = [
  'left',
  'right',
  'soft',
  'hard',
  'cw',
  'ccw',
  'hold',
  'targetPrev',
  'targetNext',
  'pause',
] as const;
export type Action = (typeof actionNames)[number];
export const actionLabels: Record<Action, string> = {
  left: '左へ移動',
  right: '右へ移動',
  soft: 'ソフトドロップ',
  hard: 'ハードドロップ',
  cw: '右回転',
  ccw: '左回転',
  hold: 'HOLD',
  targetPrev: '前のターゲット',
  targetNext: '次のターゲット',
  pause: 'メニュー',
};
const profile = z.record(z.enum(actionNames), z.string().max(40));
export const settingsSchema = z.object({
  keyboard: profile.default({
    left: 'ArrowLeft',
    right: 'ArrowRight',
    soft: 'ArrowDown',
    hard: 'ArrowUp',
    cw: 'KeyX',
    ccw: 'KeyZ',
    hold: 'KeyC',
    targetPrev: 'KeyQ',
    targetNext: 'KeyE',
    pause: 'Escape',
  }),
  gamepad: profile.default({
    left: 'b14',
    right: 'b15',
    soft: 'b13',
    hard: 'b12',
    cw: 'b1',
    ccw: 'b0',
    hold: 'b4',
    targetPrev: 'b6',
    targetNext: 'b7',
    pause: 'b9',
  }),
  dasMs: z.number().min(0).max(500).default(150),
  arrMs: z.number().min(0).max(200).default(30),
  deadzone: z.number().min(0.1).max(0.9).default(0.35),
  gamepadIndex: z.number().int().min(0).max(15).default(0),
  volume: z.number().min(0).max(1).default(0.25),
  ghost: z.boolean().default(true),
  pattern: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  palette: z.enum(['classic', 'accessible']).default('classic'),
  endless: z.boolean().default(false),
  cpuCount: z.number().int().min(1).max(9).default(1),
  cpuLevel: z.enum(['easy', 'normal', 'hard']).default('normal'),
  displayName: z.string().max(20).default('PLAYER'),
  wsUrl: z
    .string()
    .max(500)
    .default(
      import.meta.env.VITE_WS_URL ||
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
          ? 'ws://127.0.0.1:3001/ws'
          : 'wss://tetris.server-on.net/ws'),
    ),
});
export type Preferences = z.infer<typeof settingsSchema>;
export function loadPreferences(): Preferences {
  try {
    return settingsSchema.parse(JSON.parse(localStorage.getItem('stacklane.preferences') || '{}'));
  } catch {
    return settingsSchema.parse({});
  }
}
export function savePreferences(p: Preferences) {
  localStorage.setItem('stacklane.preferences', JSON.stringify(p));
}
export interface Best {
  mode: string;
  time: number;
  score: number;
  lines: number;
  date: string;
}
export function bests(): Best[] {
  try {
    const a = JSON.parse(localStorage.getItem('stacklane.bests') || '[]');
    return Array.isArray(a)
      ? a.filter((x) => Number.isFinite(x.time) && Number.isFinite(x.score)).slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
export function saveBest(best: Best) {
  const list = [...bests(), best].sort((a, b) =>
    a.mode === b.mode
      ? a.mode === 'sprint'
        ? a.time - b.time
        : b.score - a.score
      : a.mode.localeCompare(b.mode),
  );
  localStorage.setItem('stacklane.bests', JSON.stringify(list.slice(0, 30)));
}
