import {useEffect,useState} from 'react';
import {actionNames,actionLabels,type Preferences,type Action} from './store';
const keyName=(key:string)=>key.replace('Key','').replace('Arrow','').replace('Digit','');
export function Settings({prefs,onChange,onClose}:{prefs:Preferences;onChange:(p:Preferences)=>void;onClose:()=>void}){
  const [tab,setTab]=useState('input'),[capture,setCapture]=useState<{profile:'keyboard'|'gamepad';action:Action}|null>(null),[pads,setPads]=useState<(Gamepad|null)[]>([]),[warning,setWarning]=useState('');
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(!capture||capture.profile!=='keyboard')return;e.preventDefault();e.stopImmediatePropagation();if(e.code==='Escape'){setCapture(null);return;}onChange({...prefs,keyboard:{...prefs.keyboard,[capture.action]:e.code}});setCapture(null);setWarning(e.ctrlKey||e.metaKey||/^(F\d|Tab)/.test(e.code)?'ブラウザの予約キーと衝突する場合があります。別のキーをおすすめします。':'');};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[capture,prefs,onChange]);
  useEffect(()=>{
    const timer=setInterval(()=>{
      const list=Array.from(navigator.getGamepads?.()||[]);setPads(list);
      if(capture?.profile==='gamepad'){
        const pad=list[prefs.gamepadIndex];if(!pad)return;
        const b=pad.buttons.findIndex(b=>b.pressed),axis=pad.axes.findIndex(v=>Math.abs(v)>.65);
        const code=b>=0?`b${b}`:axis>=0?`axis${axis}${pad.axes[axis]>0?'+':'-'}`:null;
        if(code){onChange({...prefs,gamepad:{...prefs.gamepad,[capture.action]:code}});setCapture(null);}
      }
    },100);return()=>clearInterval(timer);
  },[capture,prefs,onChange]);
  const number=(key:'dasMs'|'arrMs'|'cpuCount'|'volume'|'deadzone',label:string,min:number,max:number,step=1)=><label>{label}<input type={key==='volume'||key==='deadzone'?'range':'number'} aria-label={label} min={min} max={max} step={step} value={prefs[key]} onChange={e=>onChange({...prefs,[key]:Math.min(max,Math.max(min,+e.target.value))})}/></label>;
  return <div className="overlay"><div className="modal settings-modal"><div className="modal-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>プレイ設定</h2></div><button className="icon-button" onClick={onClose} aria-label="設定を閉じる">×</button></div><div className="tabs">{[['input','操作'],['display','画面・音'],['solo','ソロ'],['connection','接続']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setCapture(null);}}>{label}</button>)}</div>
    {tab==='input'&&<><p>変更は自動保存され、次のゲームから反映されます。オンラインでは部屋の入力制限が優先されます。</p><div className="form-columns">{number('dasMs','DAS (ms)',0,500)}{number('arrMs','ARR (ms)',0,200)}</div><p className="muted">DAS：横移動の長押し待ち時間。ARR：連続移動の間隔。両方0で即座に端へ移動します。</p><label>ゲームパッド<select value={prefs.gamepadIndex} onChange={e=>onChange({...prefs,gamepadIndex:+e.target.value})}>{pads.filter(Boolean).length?pads.map((p,i)=>p&&<option value={i} key={i}>{p.id}</option>):<option value={0}>未接続 — ボタンを押すと認識します</option>}</select></label>{number('deadzone',`スティックのデッドゾーン (${prefs.deadzone.toFixed(2)})`,.1,.9,.05)}<div className="bindings"><div className="binding-row heading"><span>操作</span><span>キーボード</span><span>ゲームパッド</span></div>{actionNames.map(action=><div className="binding-row" key={action}><span>{actionLabels[action]}</span>{(['keyboard','gamepad'] as const).map(profile=><button key={profile} className={`binding-button ${capture?.profile===profile&&capture.action===action?'listening':''}`} onClick={()=>setCapture({profile,action})}>{capture?.profile===profile&&capture.action===action?'入力待ち…':keyName(prefs[profile][action])}</button>)}</div>)}</div>{warning&&<p className="notice">{warning}</p>}<p className="muted">スティックも割当できます。キーボードの割当待ちは Escape で中止。初期配列は PROJECT_DEFAULT。</p></>}
    {tab==='display'&&<><label><input type="checkbox" checked={prefs.ghost} onChange={e=>onChange({...prefs,ghost:e.target.checked})}/>ゴーストを表示</label><label><input type="checkbox" checked={prefs.pattern} onChange={e=>onChange({...prefs,pattern:e.target.checked})}/>ミノに文字・輪郭を表示</label><label>配色<select value={prefs.palette} onChange={e=>onChange({...prefs,palette:e.target.value as Preferences['palette']})}><option value="classic">クラシック</option><option value="accessible">色覚サポート</option></select></label>{number('volume',`効果音 (${Math.round(prefs.volume*100)}%)`,0,1,.05)}<label><input type="checkbox" checked={prefs.reducedMotion} onChange={e=>onChange({...prefs,reducedMotion:e.target.checked})}/>画面の動きを控えめにする</label></>}
    {tab==='solo'&&<><label><input type="checkbox" checked={prefs.endless} onChange={e=>onChange({...prefs,endless:e.target.checked})}/>マラソンをエンドレスにする</label><label>CPUの強さ<select value={prefs.cpuLevel} onChange={e=>onChange({...prefs,cpuLevel:e.target.value as Preferences['cpuLevel']})}><option value="easy">EASY — ゆっくり練習</option><option value="normal">NORMAL — ほどよく対戦</option><option value="hard">HARD — 先読みで勝負</option></select></label>{number('cpuCount','CPUの人数',1,9)}</>}
    {tab==='connection'&&<><label>ゲスト名<input maxLength={20} value={prefs.displayName} onChange={e=>onChange({...prefs,displayName:e.target.value})}/></label><label>対戦サーバーURL<input value={prefs.wsUrl} placeholder="wss://tetris.server-on.net/ws" onChange={e=>onChange({...prefs,wsUrl:e.target.value})}/></label><p>通常は初期設定で接続できます。自分でサーバーを立てる場合に変更してください。HTTPSのページでは WSS 接続が必要です。</p></>}
    <button className="button primary wide" onClick={()=>{setCapture(null);onClose();}}>保存して閉じる ✓</button></div></div>;
}
