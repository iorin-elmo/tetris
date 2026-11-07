import { useEffect, useRef } from 'react';
import {
  cells,
  ghost,
  SHAPES,
  PIECES,
  type GameState,
  type Piece,
} from '../../../../packages/engine/src/index';
import { PROJECT_DEFAULT, type Rules } from '../../../../packages/rulesets/src/index';
import type { Preferences } from '../settings/store';
import { placementWarning, type PlacementWarning } from '../game/danger';
export const colors = [
  '',
  '#42d5ee',
  '#f3d44b',
  '#b575ef',
  '#6bdb78',
  '#ed5975',
  '#598aee',
  '#ed9d4b',
  '#697381',
];
const accessible = [
  '',
  '#57c7ed',
  '#f5e88e',
  '#bd9fea',
  '#77cfbe',
  '#ed9cbb',
  '#669bee',
  '#ecb26a',
  '#7d8896',
];
function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  value: number,
  pattern: boolean,
  palette: string,
) {
  ctx.fillStyle = (palette === 'accessible' ? accessible : colors)[value];
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = '#ffffff29';
  ctx.fillRect(x + 2, y + 2, size - 4, 2);
  ctx.fillStyle = '#00000020';
  ctx.fillRect(x + 2, y + size - 4, size - 4, 2);
  if (pattern) {
    ctx.strokeStyle = '#10151a88';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
    ctx.fillStyle = '#11151e';
    ctx.font = `${size * 0.4}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(value === 8 ? '·' : PIECES[value - 1], x + size / 2, y + size * 0.65);
  }
}
export function drawBoard(
  canvas: HTMLCanvasElement,
  state: Pick<GameState, 'board' | 'active' | 'alive'> & Partial<GameState>,
  r: Rules,
  prefs: Pick<Preferences, 'ghost' | 'pattern' | 'palette'>,
  small = false,
  warning?: PlacementWarning,
) {
  const overflowRows = small ? 0 : 2;
  const unit = small ? 12 : 28,
    w = r.fieldWidth * unit,
    h = (r.visibleHeight + overflowRows) * unit,
    offset = r.hiddenHeight - overflowRows,
    dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#08080b';
  ctx.fillRect(0, 0, w, h);
  if (!small) {
    ctx.fillStyle = '#121218';
    ctx.fillRect(0, 0, w, overflowRows * unit);
  }
  ctx.strokeStyle = '#ffffff07';
  ctx.lineWidth = 1;
  for (let x = 0; x <= r.fieldWidth; x++) {
    ctx.beginPath();
    ctx.moveTo(x * unit + 0.5, 0);
    ctx.lineTo(x * unit + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= r.visibleHeight + overflowRows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * unit + 0.5);
    ctx.lineTo(w, y * unit + 0.5);
    ctx.stroke();
  }
  for (let y = 0; y < r.visibleHeight + overflowRows; y++)
    for (let x = 0; x < r.fieldWidth; x++) {
      const value = state.board[(y + offset) * r.fieldWidth + x];
      if (value) block(ctx, x * unit, y * unit, unit, value, prefs.pattern && !small, prefs.palette);
    }
  if (state.active && state.alive) {
    if ((prefs.ghost || r.forceGhost) && state.queue) {
      const g = ghost(state as GameState, r);
      if (g) {
        ctx.strokeStyle = warning?.reason ? '#ff536f' : '#ffffff66';
        ctx.lineWidth = 1;
        for (const [x, y] of cells(g))
          if (y >= offset) ctx.strokeRect(x * unit + 2, (y - offset) * unit + 2, unit - 4, unit - 4);
      }
    }
    for (const [x, y] of cells(state.active))
      if (y >= offset)
        block(
          ctx,
          x * unit,
          (y - offset) * unit,
          unit,
          PIECES.indexOf(state.active.kind) + 1,
          prefs.pattern && !small,
          prefs.palette,
        );
  }
  if (!small) {
    ctx.strokeStyle = warning?.nearTop || warning?.reason ? '#ff536f' : '#ffffff44';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, overflowRows * unit + 0.5);
    ctx.lineTo(w, overflowRows * unit + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    if (state.alive && (warning?.nearTop || warning?.reason)) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff536f';
      ctx.fillStyle = '#ff536f22';
      for (const [x, y] of warning.spawnCells) {
        if (y < offset) continue;
        ctx.fillRect(x * unit + 2, (y - offset) * unit + 2, unit - 4, unit - 4);
        ctx.strokeRect(x * unit + 2, (y - offset) * unit + 2, unit - 4, unit - 4);
      }
      if (warning.reason) {
        // Keep this warning visible even when the player's ghost is disabled.
        for (const [x, y] of warning.landingCells) {
          if (y < offset) continue;
          const px = x * unit,
            py = (y - offset) * unit;
          ctx.fillRect(px + 2, py + 2, unit - 4, unit - 4);
          ctx.strokeRect(px + 2, py + 2, unit - 4, unit - 4);
          ctx.beginPath();
          ctx.moveTo(px + 7, py + 7);
          ctx.lineTo(px + unit - 7, py + unit - 7);
          ctx.moveTo(px + unit - 7, py + 7);
          ctx.lineTo(px + 7, py + unit - 7);
          ctx.stroke();
        }
      }
    }
  }
  if (!state.alive) {
    ctx.fillStyle = '#0b0f1699';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9ced6';
    ctx.font = `bold ${small ? 16 : 30}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('KO', w / 2, h / 2);
  }
}
export function Board({
  state,
  rules = PROJECT_DEFAULT,
  prefs,
  small = false,
  label = 'プレイフィールド',
  warning,
}: {
  state: GameState;
  rules?: Rules;
  prefs: Preferences;
  small?: boolean;
  label?: string;
  warning?: PlacementWarning;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current)
      drawBoard(
        ref.current,
        state,
        rules,
        prefs,
        small,
        small ? undefined : (warning ?? placementWarning(state, rules)),
      );
  }, [state, rules, prefs, small, warning]);
  return (
    <canvas
      className="board-canvas"
      ref={ref}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `${rules.fieldWidth} / ${rules.visibleHeight + (small ? 0 : 2)}` }}
    />
  );
}
export function MiniPiece({ piece }: { piece: Piece | null }) {
  return (
    <div className="mini-piece" aria-label={piece || '空'}>
      {piece &&
        SHAPES[piece][0].map(([x, y], i) => (
          <i key={i} style={{ left: x * 16, top: y * 16, background: colors[PIECES.indexOf(piece) + 1] }} />
        ))}
    </div>
  );
}
