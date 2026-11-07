import { cells, ghost, step, type GameState, type TopoutReason } from '../../../../packages/engine/src/index';
import type { Rules } from '../../../../packages/rulesets/src/index';

export interface PlacementWarning {
  nearTop: boolean;
  reason: TopoutReason | null;
  spawnCells: readonly (readonly [number, number])[];
  landingCells: readonly (readonly [number, number])[];
}

// Use the engine itself so line clears, cancellation, garbage and delayed spawns
// follow exactly the same top-out rules as the actual game.
export function placementWarning(state: GameState, rules: Rules): PlacementWarning {
  const nearTop = state.board.slice(0, (rules.hiddenHeight + 5) * rules.fieldWidth).some(Boolean);
  const landing = state.active && state.alive ? ghost(state, rules) : null;
  const next = state.queue[0];
  const spawnCells = next
    ? cells({ kind: next, rotation: 0, x: Math.floor(rules.fieldWidth / 2) - 2, y: rules.hiddenHeight - 1 })
    : [];
  const result: PlacementWarning = {
    nearTop,
    reason: null,
    spawnCells,
    landingCells: landing ? cells(landing) : [],
  };
  if (!landing || (!nearTop && !state.garbage.some((p) => p.arrivalTick <= state.tick + 1))) return result;
  let projected = step(state, { hard: true }, rules).state;
  // A clear may postpone the next spawn. No gravity/input runs after it spawns.
  while (projected.alive && !projected.active) projected = step(projected, {}, rules).state;
  result.reason = projected.topoutReason ?? null;
  return result;
}
