import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Rules } from '../../../../packages/rulesets/src/index';
import { PROJECT_DEFAULT } from '../../../../packages/rulesets/src/index';
import type { Standing, Skill } from '../../../../packages/protocol/src/index';
import type { MatchArchive } from '../matches/match';
export class Store {
  db: DatabaseSync;
  private replayBuffer: { matchId: string; tick: number; playerId: string; data: unknown }[] = [];
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, rules_json TEXT NOT NULL, seeds_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results (match_id TEXT NOT NULL REFERENCES matches(id), player_id TEXT NOT NULL, name TEXT NOT NULL, team INTEGER NOT NULL, place INTEGER NOT NULL, ko INTEGER NOT NULL, stats_json TEXT NOT NULL, valid INTEGER NOT NULL, PRIMARY KEY(match_id,player_id));
      CREATE INDEX IF NOT EXISTS results_player ON results(player_id);
      CREATE TABLE IF NOT EXISTS replay (match_id TEXT NOT NULL REFERENCES matches(id), tick INTEGER NOT NULL, player_id TEXT NOT NULL, data_json TEXT NOT NULL);
      `);
    const columns = this.db.prepare('PRAGMA table_info(matches)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'ended_tick'))
      this.db.exec('ALTER TABLE matches ADD COLUMN ended_tick INTEGER');
    this.db.exec('PRAGMA user_version=2');
  }
  guest(hash: string) {
    return this.db.prepare('SELECT id, expires FROM guests WHERE token_hash=?').get(hash) as
      { id: string; expires: number } | undefined;
  }
  saveGuest(id: string, hash: string) {
    this.db
      .prepare(
        'INSERT INTO guests(id,token_hash,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, expires=excluded.expires',
      )
      .run(id, hash, Date.now() + 86400000);
  }
  start(archive: MatchArchive) {
    this.db
      .prepare('INSERT INTO matches(id,started_at,rules_json,seeds_json) VALUES(?,?,?,?)')
      .run(archive.id, Date.now(), JSON.stringify(archive.rules), JSON.stringify(archive));
  }
  recordInputs(matchId: string, tick: number, playerId: string, data: unknown) {
    this.replayBuffer.push({ matchId, tick, playerId, data });
  }
  flushReplay() {
    if (!this.replayBuffer.length) return;
    const rows = this.replayBuffer.splice(0);
    this.db.exec('BEGIN');
    try {
      const stmt = this.db.prepare('INSERT INTO replay(match_id,tick,player_id,data_json) VALUES(?,?,?,?)');
      for (const row of rows) stmt.run(row.matchId, row.tick, row.playerId, JSON.stringify(row.data));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.replayBuffer.unshift(...rows);
      throw error;
    }
  }
  end(id: string, standings: Standing[], rules: Rules, tick: number) {
    this.flushReplay();
    const valid =
      rules.attackProfile === 'ppt2' &&
      JSON.stringify(rules.attackRules) === JSON.stringify(PROJECT_DEFAULT.attackRules);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE matches SET ended_at=?,ended_tick=? WHERE id=?').run(Date.now(), tick, id);
      const stmt = this.db.prepare(
        'INSERT INTO results(match_id,player_id,name,team,place,ko,stats_json,valid) VALUES(?,?,?,?,?,?,?,?)',
      );
      for (const s of standings)
        stmt.run(
          id,
          s.id,
          s.name,
          s.team,
          s.teamPlace ?? s.place,
          s.ko,
          JSON.stringify(s.stats),
          valid && s.stats.elapsedActiveSeconds >= 10 && s.stats.placements >= 5 ? 1 : 0,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  skill(id: string): Skill {
    const rows = this.db
      .prepare(
        'SELECT stats_json,place FROM results r JOIN matches m ON m.id=r.match_id WHERE r.player_id=? AND r.valid=1 AND m.ended_at>? ORDER BY m.ended_at DESC LIMIT 20',
      )
      .all(id, Date.now() - 90 * 86400000) as { stats_json: string; place: number }[];
    if (!rows.length)
      return { value: 1, confidence: 0, matches: 0, pps: 0, apm: 0, app: 0, survivalSeconds: 0, winRate: 0 };
    const average = (key: 'pps' | 'apm' | 'app' | 'elapsedActiveSeconds') =>
      rows.reduce((n, row) => n + (JSON.parse(row.stats_json)[key] ?? 0), 0) / rows.length;
    return {
      value: 1,
      confidence: Math.min(1, rows.length / 10),
      matches: rows.length,
      pps: average('pps'),
      apm: average('apm'),
      app: average('app'),
      survivalSeconds: average('elapsedActiveSeconds'),
      winRate: rows.filter((r) => r.place === 1).length / rows.length,
    };
  }
  close() {
    this.flushReplay();
    this.db.close();
  }
}
