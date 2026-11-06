import {random,type GarbagePacket,type GameState} from './index';
import type {Rules} from '../../rulesets/src/index';
export interface Combatant {id:string;team:number;alive:boolean;danger:number;ko:number;target:string|null}
export function targets(source:Combatant,players:Combatant[],r:Rules,seed:number):{targets:string[];seed:number}{
  const enemies=players.filter(p=>p.alive&&p.id!==source.id&&(r.mode!=='team'||p.team!==source.team));
  if(!enemies.length)return{targets:[],seed};
  if(r.targeting==='all_equal')return{targets:enemies.map(p=>p.id),seed};
  let selected:Combatant|undefined;
  if(r.targeting==='manual')selected=enemies.find(p=>p.id===source.target);
  else if(r.targeting==='danger')selected=[...enemies].sort((a,b)=>b.danger-a.danger||a.id.localeCompare(b.id))[0];
  else if(r.targeting==='badges_like')selected=[...enemies].sort((a,b)=>b.ko-a.ko||a.id.localeCompare(b.id))[0];
  else if(r.targeting==='attackers')selected=enemies.find(p=>p.target===source.id);
  if(!selected){let n:number;[seed,n]=random(seed);selected=enemies[Math.floor(n*enemies.length)];}
  return{targets:[selected.id],seed};
}
export function distribute(lines:number,ids:string[],offset:number):Record<string,number>{
  const result:Record<string,number>={};if(!ids.length)return result;
  for(let i=0;i<ids.length;i++)result[ids[(i+offset)%ids.length]]=Math.floor(lines/ids.length)+(i<lines%ids.length?1:0);
  return result;
}
export function garbagePacket(id:string,sourceId:string,targetId:string,lines:number,tick:number,r:Rules,seed:number):{packet:GarbagePacket;seed:number}{
  const holes:number[]=[];let n:number;[seed,n]=random(seed);let hole=Math.floor(n*r.fieldWidth);
  for(let i=0;i<lines;i++){
    if(r.garbageStyle==='tetrio'&&i>0){[seed,n]=random(seed);if(n<r.messiness){[seed,n]=random(seed);hole=Math.floor(n*r.fieldWidth);}}
    holes.push(hole);
  }
  return{seed,packet:{id,sourceId,targetId,lines,createdTick:tick,arrivalTick:tick+r.garbageTravelTicks,holes,status:'pending'}};
}
export function danger(s:GameState,r:Rules){
  const index=s.board.findIndex(Boolean);return index<0?0:r.visibleHeight+r.hiddenHeight-Math.floor(index/r.fieldWidth);
}
export function winner(players:Combatant[],r:Rules):{finished:boolean;winners:string[]}{
  const alive=players.filter(p=>p.alive);
  const finished=r.mode==='team'?new Set(alive.map(p=>p.team)).size<=1:alive.length<=1;
  return{finished,winners:finished?alive.map(p=>p.id):[]};
}
