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
export const colors = [
  '',
  '#5bd7ed',
  '#f4da65',
  '#ba9cf8',
  '#8bd898',
  '#f07f8b',
  '#7ca7f7',
  '#f0b472',
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
) {
  const unit = small ? 12 : 28,
    w = r.fieldWidth * unit,
    h = r.visibleHeight * unit,
    dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff07';
  ctx.lineWidth = 1;
  for (let x = 0; x <= r.fieldWidth; x++) {
    ctx.beginPath();
    ctx.moveTo(x * unit + 0.5, 0);
    ctx.lineTo(x * unit + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= r.visibleHeight; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * unit + 0.5);
    ctx.lineTo(w, y * unit + 0.5);
    ctx.stroke();
  }
  for (let y = 0; y < r.visibleHeight; y++)
    for (let x = 0; x < r.fieldWidth; x++) {
      const value = state.board[(y + r.hiddenHeight) * r.fieldWidth + x];
      if (value) block(ctx, x * unit, y * unit, unit, value, prefs.pattern && !small, prefs.palette);
    }
  if (state.active && state.alive) {
    if ((prefs.ghost || r.forceGhost) && state.queue) {
      const g = ghost(state as GameState, r);
      if (g) {
        ctx.strokeStyle = '#c2f97066';
        ctx.lineWidth = 1;
        for (const [x, y] of cells(g))
          if (y >= r.hiddenHeight)
            ctx.strokeRect(x * unit + 2, (y - r.hiddenHeight) * unit + 2, unit - 4, unit - 4);
      }
    }
    for (const [x, y] of cells(state.active))
      if (y >= r.hiddenHeight)
        block(
          ctx,
          x * unit,
          (y - r.hiddenHeight) * unit,
          unit,
          PIECES.indexOf(state.active.kind) + 1,
          prefs.pattern && !small,
          prefs.palette,
        );
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
}: {
  state: GameState;
  rules?: Rules;
  prefs: Preferences;
  small?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawBoard(ref.current, state, rules, prefs, small);
  }, [state, rules, prefs, small]);
  return (
    <canvas
      className="board-canvas"
      ref={ref}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `${rules.fieldWidth} / ${rules.visibleHeight}` }}
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
