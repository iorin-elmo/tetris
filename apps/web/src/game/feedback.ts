import type { LockEvent, TopoutReason } from '../../../../packages/engine/src/index';

export interface ClearFeedback {
  event: LockEvent;
  tick: number;
}

export function clearLabels(event: LockEvent) {
  return {
    spin: event.spin === 'full' ? 'T-SPIN' : event.spin === 'mini' ? 'T-SPIN MINI' : '',
    clear: ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][event.lines] ?? '',
    perfect: event.perfectClear,
    b2b: event.b2b,
    attack: event.generated,
  };
}

export const topoutLabels: Record<TopoutReason, string> = {
  'block-out': '次のミノの出現位置がふさがりました。',
  'lock-out': 'ミノ全体が盤面の上にはみ出した状態で固定されました。',
  'garbage-out': 'せり上がりでブロックが盤面の上限を超えました。',
};

export const warningLabels: Record<TopoutReason, string> = {
  'block-out': 'この位置に置くと次のミノが出せません',
  'lock-out': 'この位置で固定するとゲームオーバー',
  'garbage-out': 'この位置に置くとせり上がりで上限を超えます',
};
