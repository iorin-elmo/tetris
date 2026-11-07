import { Match, type MatchArchive } from './match';
import type { Input } from '../../../../packages/engine/src/index';
export interface ReplayEntry {
  tick: number;
  playerId: string;
  data:
    | { kind: 'input'; frames: { tick: number; seq: number; input: Input }[] }
    | { kind: 'target'; targetId: string }
    | { kind: 'disconnect' }
    | { kind: 'input.reset' }
    | { kind: 'forfeit' };
}
export function replayMatch(archive: MatchArchive, entries: ReplayEntry[], endTick: number) {
  const match = Match.restore(archive);
  let index = 0;
  while (match.tick < endTick && !match.finished) {
    while (index < entries.length && entries[index].tick <= match.tick) {
      const entry = entries[index++],
        player = match.players.find((p) => p.id === entry.playerId);
      if (!player) continue;
      switch (entry.data.kind) {
        case 'input':
          player.queue.push(...structuredClone(entry.data.frames));
          break;
        case 'target':
          player.target = entry.data.targetId;
          break;
        case 'disconnect':
        case 'input.reset':
          match.release(player.id);
          break;
        case 'forfeit':
          player.state.alive = false;
          break;
      }
    }
    match.advance();
  }
  return match;
}
