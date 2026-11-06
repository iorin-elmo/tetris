import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Rules} from '../../../../packages/rulesets/src/index';
import {PROJECT_DEFAULT} from '../../../../packages/rulesets/src/index';
import type {Standing,Skill} from '../../../../packages/protocol/src/index';
export class Store {
  db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, rules_json TEXT NOT NULL, seeds_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS results (match_id TEXT NOT NULL REFERENCES matches(id), player_id TEXT NOT NULL, name TEXT NOT NULL, team INTEGER NOT NULL, place INTEGER NOT NULL, ko INTEGER NOT NULL, stats_json TEXT NOT NULL, valid INTEGER NOT NULL, PRIMARY KEY(match_id,player_id));
      CREATE INDEX IF NOT EXISTS results_player ON results(player_id);
      CREATE TABLE IF NOT EXISTS replay (match_id TEXT NOT NULL REFERENCES matches(id), tick INTEGER NOT NULL, player_id TEXT NOT NULL, data_json TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  guest(hash:string){return this.db.prepare('SELECT id, expires FROM guests WHERE token_hash=?').get(hash) as {id:string;expires:number}|undefined;}
  saveGuest(id:string,hash:string){this.db.prepare('INSERT INTO guests(id,token_hash,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, expires=excluded.expires').run(id,hash,Date.now()+86400000);}
  start(id:string,rules:Rules,seeds:Record<string,number>){this.db.prepare('INSERT INTO matches(id,started_at,rules_json,seeds_json) VALUES(?,?,?,?)').run(id,Date.now(),JSON.stringify(rules),JSON.stringify(seeds));}
  recordInputs(matchId:string,tick:number,playerId:string,data:unknown){this.db.prepare('INSERT INTO replay(match_id,tick,player_id,data_json) VALUES(?,?,?,?)').run(matchId,tick,playerId,JSON.stringify(data));}
  end(id:string,standings:Standing[],rules:Rules){
    const valid=rules.attackProfile==='ppt2'&&JSON.stringify(rules.attackRules)===JSON.stringify(PROJECT_DEFAULT.attackRules);
    this.db.exec('BEGIN');try{
      this.db.prepare('UPDATE matches SET ended_at=? WHERE id=?').run(Date.now(),id);
      const stmt=this.db.prepare('INSERT INTO results(match_id,player_id,name,team,place,ko,stats_json,valid) VALUES(?,?,?,?,?,?,?,?)');
      for(const s of standings)stmt.run(id,s.id,s.name,s.team,s.place,s.ko,JSON.stringify(s.stats),valid?1:0);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  skill(id:string):Skill{
    const rows=this.db.prepare('SELECT stats_json FROM results r JOIN matches m ON m.id=r.match_id WHERE r.player_id=? AND r.valid=1 AND m.ended_at>? ORDER BY m.ended_at DESC LIMIT 20').all(id,Date.now()-90*86400000) as {stats_json:string}[];
    if(!rows.length)return{value:1,confidence:0,matches:0,pps:0,apm:0,app:0};
    const average=(key:'pps'|'apm'|'app')=>rows.reduce((n,row)=>n+(JSON.parse(row.stats_json)[key]??0),0)/rows.length;
    return{value:1,confidence:Math.min(1,rows.length/10),matches:rows.length,pps:average('pps'),apm:average('apm'),app:average('app')};
  }
  close(){this.db.close();}
}
