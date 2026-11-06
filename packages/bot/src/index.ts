import {cells,createGame,fits,ghost,rotate,SHAPES,type Active,type GameState,type Input} from '../../engine/src/index';
import type {Rules} from '../../rulesets/src/index';
export type Difficulty='easy'|'normal'|'hard';
interface Candidate {active:Active;path:Input[];board:number[];score:number;lines:number}
export interface BotMemory {path:Input[];placement:number;wait:number;debug:{candidates:number;depth:number;budget:number}}
export const createBot=():BotMemory=>({path:[],placement:-1,wait:0,debug:{candidates:0,depth:1,budget:180}});
function evaluate(board:number[],r:Rules,lines:number){
  const total=r.hiddenHeight+r.visibleHeight,heights:number[]=[],holes:number[]=[];
  for(let x=0;x<r.fieldWidth;x++){let top=total,hole=0;for(let y=0;y<total;y++){if(board[y*r.fieldWidth+x]&&top===total)top=y;else if(!board[y*r.fieldWidth+x]&&top<total)hole++;}heights.push(total-top);holes.push(hole);}
  const rough=heights.slice(1).reduce((n,h,i)=>n+Math.abs(h-heights[i]),0),height=heights.reduce((n,h)=>n+h,0);
  return lines*3.4-height*.55-holes.reduce((n,h)=>n+h,0)*8.3-rough*.44-Math.max(...heights)*.45;
}
function candidates(s:GameState,r:Rules):Candidate[]{
  if(!s.active)return[];
  const pending:{active:Active;path:Input[]}[]=[{active:s.active,path:[]}],seen=new Set<string>(),result:Candidate[]=[],landings=new Set<string>();
  for(let index=0;index<pending.length&&index<180;index++){
    const item=pending[index],a=item.active,key=`${a.x}:${a.y}:${a.rotation}`;if(seen.has(key))continue;seen.add(key);
    const landed=ghost({...s,active:a},r)!;
    const landingKey=`${landed.x}:${landed.y}:${landed.rotation}`;
    if(!landings.has(landingKey)){
      landings.add(landingKey);const board=[...s.board];for(const[x,y]of cells(landed))board[y*r.fieldWidth+x]=1;
      const kept:number[][]=[];for(let y=0;y<r.hiddenHeight+r.visibleHeight;y++){const row=board.slice(y*r.fieldWidth,(y+1)*r.fieldWidth);if(row.some(v=>!v))kept.push(row);}
      const lines=r.hiddenHeight+r.visibleHeight-kept.length,cleared=[...Array(lines*r.fieldWidth).fill(0),...kept.flat()];
      result.push({active:landed,path:[...item.path,{hard:true}],board:cleared,score:evaluate(cleared,r,lines),lines});
    }
    for(const direction of [-1,1] as const){
      const moved={...a,x:a.x+direction};if(fits(s,moved,r))pending.push({active:moved,path:[...item.path,direction===-1?{left:true}:{right:true},{}]});
      const copy={...s,active:{...a}};if(rotate(copy,direction,r))pending.push({active:copy.active!,path:[...item.path,direction===1?{cw:true}:{ccw:true}]});
    }
  }
  return result.sort((a,b)=>b.score-a.score);
}
export function plan(s:GameState,r:Rules,level:Difficulty):{path:Input[];candidates:number;depth:number}{
  const options=candidates(s,r);let count=options.length;
  if(level==='hard'&&s.queue.length){
    for(const option of options.slice(0,3)){
      const next=createGame(1,r);next.board=option.board;next.active={kind:s.queue[0],rotation:0,x:Math.floor(r.fieldWidth/2)-2,y:r.hiddenHeight-2};
      const follow=candidates(next,r);count+=follow.length;option.score+=.65*(follow[0]?.score??-10000);
    }
    // Compare only expanded options, otherwise unexpanded scores use a different scale.
    options.splice(3);options.sort((a,b)=>b.score-a.score);
  }
  return{path:options[0]?.path??[{hard:true}],candidates:count,depth:level==='hard'?2:1};
}
export function botInput(s:GameState,r:Rules,memory:BotMemory,level:Difficulty):Input{
  if(!s.active||!s.alive)return{};
  if(memory.placement!==s.stats.placements){
    const p=plan(s,r,level);memory.path=p.path;memory.placement=s.stats.placements;memory.wait=0;memory.debug={candidates:p.candidates,depth:p.depth,budget:180};
  }
  if(memory.wait-->0)return{};
  memory.wait=level==='easy'?7:level==='normal'?3:1;
  return memory.path.shift()??{hard:true};
}
