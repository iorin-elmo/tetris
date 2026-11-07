import { useEffect, useRef, useState } from 'react';
import {
  createGame,
  step,
  statistics,
  receiveGarbage,
  type GameState,
  type GameEvent,
} from '../../../../packages/engine/src/index';
import {
  targets,
  distribute,
  garbagePacket,
  danger,
  type Combatant,
} from '../../../../packages/engine/src/battle';
import { botInput, createBot, type BotMemory } from '../../../../packages/bot/src/index';
import { PROJECT_DEFAULT, type Rules } from '../../../../packages/rulesets/src/index';
import { Controller } from '../input/controller';
import { saveBest, type Preferences } from '../settings/store';
import { sound } from './audio';
import type { ClearFeedback } from './feedback';
export type SoloMode = 'marathon' | 'sprint' | 'cpu';
export interface Standing {
  id: string;
  name: string;
  team: number;
  place: number;
  teamPlace?: number;
  ko: number;
  stats: ReturnType<typeof statistics>;
}
export interface GameResult {
  title: string;
  standings: Standing[];
  success: boolean;
}
export interface LocalView {
  mode: SoloMode;
  state: GameState;
  opponents: { id: string; name: string; state: GameState; team: number }[];
  paused: boolean;
  result: GameResult | null;
  message: string;
  feedback?: ClearFeedback;
  target: string | null;
  rules: Rules;
  seed: number;
}
export function useLocalGame(controller: Controller, prefs: Preferences) {
  const current = useRef<LocalView | null>(null),
    preferences = useRef(prefs);
  preferences.current = prefs;
  const [view, setView] = useState<LocalView | null>(null);
  const bots = useRef<Record<string, BotMemory>>({}),
    deaths = useRef<string[]>([]),
    kos = useRef<Record<string, number>>({}),
    battleRng = useRef(1),
    packetNumber = useRef(0);
  const battleTick = useRef(0);
  const start = (mode: SoloMode, seed?: number) => {
    controller.reset();
    const r = { ...PROJECT_DEFAULT, dasMs: preferences.current.dasMs, arrMs: preferences.current.arrMs };
    const actualSeed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    bots.current = {};
    deaths.current = [];
    kos.current = {};
    battleRng.current = actualSeed ^ 0x5a5a5a5a;
    packetNumber.current = 0;
    battleTick.current = 0;
    const opponents =
      mode === 'cpu'
        ? Array.from({ length: preferences.current.cpuCount }, (_, i) => {
            const id = `cpu-${i}`;
            bots.current[id] = createBot();
            return {
              id,
              name: `CPU ${String(i + 1).padStart(2, '0')}`,
              team: i + 1,
              state: createGame((actualSeed + i * 3719) >>> 0, r),
            };
          })
        : [];
    current.current = {
      mode,
      state: createGame(actualSeed, r),
      opponents,
      paused: false,
      result: null,
      message: '',
      target: opponents[0]?.id ?? null,
      rules: r,
      seed: actualSeed,
    };
    setView({ ...current.current });
  };
  const pause = () => {
    if (current.current && !current.current.result) {
      current.current.paused = !current.current.paused;
      controller.reset();
      setView({ ...current.current });
    }
  };
  const stop = () => {
    current.current = null;
    setView(null);
    controller.reset();
  };
  useEffect(() => {
    let last = performance.now(),
      accumulator = 0,
      raf = 0;
    const frame = (now: number) => {
      accumulator += Math.min(100, now - last);
      last = now;
      const v = current.current;
      if (v && !v.result) {
        while (accumulator >= 1000 / 60) {
          accumulator -= 1000 / 60;
          const input = controller.poll();
          if (input.menu) {
            v.paused = !v.paused;
            controller.reset();
          }
          if (v.paused) continue;
          battleTick.current++;
          const rules =
            v.mode === 'marathon'
              ? {
                  ...v.rules,
                  gravityTicks: Math.max(
                    1,
                    Math.round(60 * Math.pow(0.8, Math.floor(v.state.stats.linesCleared / 10))),
                  ),
                }
              : v.rules;
          const next = step(v.state, input.input, rules);
          v.state = next.state;
          if (v.mode === 'cpu') {
            const aliveTargets = v.opponents.filter((p) => p.state.alive);
            if (input.target && aliveTargets.length) {
              const index = aliveTargets.findIndex((p) => p.id === v.target);
              v.target = aliveTargets[(index + input.target + aliveTargets.length) % aliveTargets.length].id;
            }
            const output: { id: string; events: GameEvent[] }[] = [{ id: 'me', events: next.events }];
            for (const p of v.opponents) {
              const result = step(
                p.state,
                botInput(p.state, v.rules, bots.current[p.id], preferences.current.cpuLevel),
                v.rules,
              );
              p.state = result.state;
              output.push({ id: p.id, events: result.events });
            }
            const all = [{ id: 'me', name: 'YOU', team: 0, state: v.state }, ...v.opponents];
            const players: Combatant[] = all.map((p) => ({
              id: p.id,
              team: p.team,
              alive: p.state.alive,
              danger: danger(p.state, v.rules),
              ko: kos.current[p.id] ?? 0,
              target: p.id === 'me' ? v.target : null,
            }));
            for (const out of output)
              for (const e of out.events)
                if (e.type === 'lock' && e.attack > 0) {
                  const source = players.find((p) => p.id === out.id)!;
                  const selection = targets(
                    source,
                    players,
                    out.id === 'me' ? v.rules : { ...v.rules, targeting: 'random' },
                    battleRng.current,
                  );
                  battleRng.current = selection.seed;
                  for (const [id, lines] of Object.entries(
                    distribute(e.attack, selection.targets, battleTick.current),
                  )) {
                    if (!lines) continue;
                    const packet = garbagePacket(
                      `local-${packetNumber.current++}`,
                      out.id,
                      id,
                      lines,
                      battleTick.current,
                      v.rules,
                      battleRng.current,
                    );
                    battleRng.current = packet.seed;
                    if (id === 'me') v.state = receiveGarbage(v.state, packet.packet);
                    else {
                      const target = v.opponents.find((p) => p.id === id)!;
                      target.state = receiveGarbage(target.state, packet.packet);
                    }
                  }
                }
            for (const p of all)
              if (!p.state.alive && !deaths.current.includes(p.id)) {
                deaths.current.push(p.id);
                if (p.state.lastGarbageSource)
                  kos.current[p.state.lastGarbageSource] = (kos.current[p.state.lastGarbageSource] ?? 0) + 1;
              }
            if (all.filter((p) => p.state.alive).length <= 1) {
              const survivor = all.find((p) => p.state.alive);
              v.result = {
                title: survivor?.id === 'me' ? 'YOU WIN!' : survivor ? 'CPU WINS' : 'DRAW',
                success: survivor?.id === 'me',
                standings: all
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    team: p.team,
                    place: p.state.alive ? 1 : all.length - deaths.current.indexOf(p.id),
                    ko: kos.current[p.id] ?? 0,
                    stats: statistics(p.state),
                  }))
                  .sort((a, b) => a.place - b.place),
              };
              sound('end', preferences.current.volume);
            }
          }
          for (const e of next.events) {
            if (e.type === 'lock') {
              if (e.lines || e.spin !== 'none') v.feedback = { event: e, tick: v.state.tick };
              sound(e.lines ? 'clear' : 'lock', preferences.current.volume);
            }
            if (e.type === 'hold') sound('hold', preferences.current.volume);
          }
          const complete =
            v.mode === 'sprint'
              ? v.state.stats.linesCleared >= 40
              : v.mode === 'marathon' && !preferences.current.endless
                ? v.state.stats.linesCleared >= 150
                : false;
          if (v.mode !== 'cpu' && (!v.state.alive || complete)) {
            const stats = statistics(v.state);
            v.result = {
              title: complete ? 'CLEAR!' : 'GAME OVER',
              success: complete,
              standings: [{ id: 'me', name: 'YOU', team: 0, place: 1, ko: 0, stats }],
            };
            if (complete || v.mode === 'marathon')
              saveBest({
                mode: v.mode,
                time: stats.elapsedActiveSeconds,
                score: stats.score,
                lines: stats.linesCleared,
                date: new Date().toISOString(),
              });
            sound('end', preferences.current.volume);
            break;
          }
        }
        setView({ ...v });
      } else accumulator = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [controller]);
  useEffect(() => {
    const blur = () => {
      if (current.current && !current.current.result) {
        current.current.paused = true;
        setView({ ...current.current });
      }
    };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  const target = (id: string) => {
    if (current.current) current.current.target = id;
  };
  return { view, start, pause, stop, target };
}
