import { DatabaseSync } from 'node:sqlite';
import { replayMatch, type ReplayEntry } from '../apps/server/src/matches/replay';
import { checksum } from '../packages/engine/src/index';
const id = process.argv[2];
if (!id) throw new Error('Usage: pnpm run replay <match-id>');
const db = new DatabaseSync(process.env.DATABASE_PATH || 'data/stacklane.sqlite', { readOnly: true });
try {
  const row = db.prepare('SELECT seeds_json,ended_tick FROM matches WHERE id=?').get(id) as
    { seeds_json: string; ended_tick: number | null } | undefined;
  if (!row || row.ended_tick === null) throw new Error('Completed match not found');
  const archive = JSON.parse(row.seeds_json);
  if (!archive.roster) throw new Error('Legacy match has no replay archive');
  const entries = (
    db.prepare('SELECT tick,player_id,data_json FROM replay WHERE match_id=? ORDER BY rowid').all(id) as {
      tick: number;
      player_id: string;
      data_json: string;
    }[]
  ).map((r) => ({ tick: r.tick, playerId: r.player_id, data: JSON.parse(r.data_json) })) as ReplayEntry[];
  const match = replayMatch(archive, entries, row.ended_tick);
  const expected = (
    db.prepare('SELECT player_id,stats_json FROM results WHERE match_id=? ORDER BY player_id').all(id) as {
      player_id: string;
      stats_json: string;
    }[]
  ).map((r) => ({ id: r.player_id, stats: JSON.parse(r.stats_json) }));
  const actual = match
    .standings()
    .map((p) => ({ id: p.id, stats: p.stats }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Replay statistics mismatch');
  console.log(
    JSON.stringify(
      {
        matchId: id,
        tick: match.tick,
        verified: true,
        players: match.players.map((p) => ({ id: p.id, checksum: checksum(p.state) })),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
