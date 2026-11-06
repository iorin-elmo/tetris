import {useEffect,useRef,useState} from 'react';
import {createGame,step,statistics,type GameState,type GameEvent} from '../../../../packages/engine/src/index';
import {PROJECT_DEFAULT,type Rules} from '../../../../packages/rulesets/src/index';
import {Controller} from '../input/controller';
import {saveBest,type Preferences} from '../settings/store';
import {sound} from './audio';
export type SoloMode='marathon'|'sprint'|'cpu';
export interface Standing {id:string;name:string;team:number;place:number;ko:number;stats:ReturnType<typeof statistics>}
export interface GameResult {title:string;standings:Standing[];success:boolean}
export interface LocalView {mode:SoloMode;state:GameState;opponents:{id:string;name:string;state:GameState;team:number}[];paused:boolean;result:GameResult|null;message:string;target:string|null;rules:Rules;seed:number}
export function useLocalGame(controller:Controller,prefs:Preferences){
  const current=useRef<LocalView|null>(null),preferences=useRef(prefs);preferences.current=prefs;
  const [view,setView]=useState<LocalView|null>(null);
  const start=(mode:SoloMode,seed?:number)=>{
    controller.reset(); const r={...PROJECT_DEFAULT,dasMs:preferences.current.dasMs,arrMs:preferences.current.arrMs};
    const actualSeed=seed??crypto.getRandomValues(new Uint32Array(1))[0];
    current.current={mode,state:createGame(actualSeed,r),opponents:[],paused:false,result:null,message:'',target:null,rules:r,seed:actualSeed};setView({...current.current});
  };
  const pause=()=>{if(current.current&&!current.current.result){current.current.paused=!current.current.paused;controller.reset();setView({...current.current});}};
  const stop=()=>{current.current=null;setView(null);controller.reset();};
  useEffect(()=>{
    let last=performance.now(),accumulator=0,raf=0;
    const frame=(now:number)=>{
      accumulator+=Math.min(100,now-last);last=now;
      const v=current.current;
      if(v&&!v.result){
        while(accumulator>=1000/60){accumulator-=1000/60;
          const input=controller.poll();
          if(input.menu){v.paused=!v.paused;controller.reset();}
          if(v.paused)continue;
          const rules=v.mode==='marathon'?{...v.rules,gravityTicks:Math.max(1,Math.round(60*Math.pow(.8,Math.floor(v.state.stats.linesCleared/10))))}:v.rules;
          const next=step(v.state,input.input,rules);v.state=next.state;
          for(const e of next.events){
            if(e.type==='lock'){v.message=e.perfectClear?'PERFECT CLEAR':e.spin==='full'?`T-SPIN ${e.lines?['','SINGLE','DOUBLE','TRIPLE'][e.lines]:''}`:e.lines===4?'TETRIS':e.ren>0?`${e.ren} REN`:e.lines?`${e.lines} LINE CLEAR`:'';sound(e.lines?'clear':'lock',preferences.current.volume);}
            if(e.type==='hold')sound('hold',preferences.current.volume);
          }
          const complete=v.mode==='sprint'?v.state.stats.linesCleared>=40:v.mode==='marathon'&&!preferences.current.endless?v.state.stats.linesCleared>=150:false;
          if(!v.state.alive||complete){
            const stats=statistics(v.state);v.result={title:complete?'CLEAR!':'おつかれさま。',success:complete,standings:[{id:'me',name:'YOU',team:0,place:1,ko:0,stats}]};
            if(complete||v.mode==='marathon')saveBest({mode:v.mode,time:stats.elapsedActiveSeconds,score:stats.score,lines:stats.linesCleared,date:new Date().toISOString()});
            sound('end',preferences.current.volume);break;
          }
        }
        setView({...v});
      }else accumulator=0;
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
  },[controller]);
  useEffect(()=>{const blur=()=>{if(current.current&&!current.current.result){current.current.paused=true;setView({...current.current});}};window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
  return {view,start,pause,stop};
}
