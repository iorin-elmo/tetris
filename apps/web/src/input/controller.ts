import { type Input } from '../../../../packages/engine/src/index';
import { actionNames,type Action,type Preferences } from '../settings/store';
const continuous:Action[]=['left','right','soft'];
export class Controller {
  prefs:Preferences; keys=new Set<string>(); edges=new Set<Action>(); previous=new Set<Action>(); blocked=false;
  padName='ゲームパッド未接続'; padButtons:string[]=[];
  constructor(prefs:Preferences){this.prefs=prefs;}
  private down=(event:KeyboardEvent)=>{
    if(this.blocked || event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) return;
    if(Object.values(this.prefs.keyboard).includes(event.code))event.preventDefault();
    if(!this.keys.has(event.code)) for(const a of actionNames) if(this.prefs.keyboard[a]===event.code&&!continuous.includes(a))this.edges.add(a);
    this.keys.add(event.code);
  };
  private up=(event:KeyboardEvent)=>{this.keys.delete(event.code);};
  reset=()=>{this.keys.clear();this.edges.clear();this.previous.clear();};
  attach(){ window.addEventListener('keydown',this.down);window.addEventListener('keyup',this.up);window.addEventListener('blur',this.reset);document.addEventListener('visibilitychange',this.reset);return()=>{window.removeEventListener('keydown',this.down);window.removeEventListener('keyup',this.up);window.removeEventListener('blur',this.reset);document.removeEventListener('visibilitychange',this.reset);}; }
  poll():{input:Input;menu:boolean;target:number}{
    const pads=navigator.getGamepads?.()||[]; const pad=pads[this.prefs.gamepadIndex];
    const held=new Set<Action>();
    this.padButtons=[];
    if(pad?.connected){
      this.padName=pad.id;
      pad.buttons.forEach((b,i)=>{if(b.pressed)this.padButtons.push(`b${i}`);});
      pad.axes.forEach((value,i)=>{if(Math.abs(value)>this.prefs.deadzone)this.padButtons.push(`axis${i}${value>0?'+':'-'}`);});
      if(!this.blocked)for(const a of actionNames)if(this.padButtons.includes(this.prefs.gamepad[a]))held.add(a);
      // Default horizontal/vertical stick navigation supplements the default D-pad profile.
      if(!this.blocked&&this.prefs.gamepad.left==='b14'&&(pad.axes[0]??0)<-this.prefs.deadzone)held.add('left');
      if(!this.blocked&&this.prefs.gamepad.right==='b15'&&(pad.axes[0]??0)>this.prefs.deadzone)held.add('right');
      if(!this.blocked&&this.prefs.gamepad.soft==='b13'&&(pad.axes[1]??0)>this.prefs.deadzone)held.add('soft');
    }else this.padName='ゲームパッド未接続';
    for(const a of held)if(!continuous.includes(a)&&!this.previous.has(a))this.edges.add(a);
    this.previous=held;
    const input:Input={};
    if(!this.blocked)for(const a of ['left','right','soft','hard','cw','ccw','hold'] as const)input[a]=continuous.includes(a)?this.keys.has(this.prefs.keyboard[a])||held.has(a):this.edges.has(a);
    const result={input,menu:this.edges.has('pause'),target:this.edges.has('targetNext')?1:this.edges.has('targetPrev')?-1:0};
    this.edges.clear();return result;
  }
}
