import {useEffect,useMemo,useState} from 'react';
import {createGame} from '../../../../packages/engine/src/index';
import {Board} from '../canvas/Board';
import {Controller} from '../input/controller';
import {useLocalGame,type SoloMode} from '../game/useLocalGame';
import {GameView,formatTime} from '../components/GameView';
import {loadPreferences,bests,savePreferences} from '../settings/store';
import {unlockAudio} from '../game/audio';
import {Settings} from '../settings/Settings';
export function App(){
  const [prefs,setPrefs]=useState(loadPreferences),[settings,setSettings]=useState(false),[onlineOpen,setOnlineOpen]=useState(new URLSearchParams(location.search).has('room'));
  const controller=useMemo(()=>new Controller(prefs),[]);controller.prefs=prefs;controller.blocked=settings;
  useEffect(()=>controller.attach(),[controller]);
  useEffect(()=>{savePreferences(prefs);},[prefs]);
  const local=useLocalGame(controller,prefs);
  const preview=useMemo(()=>{const s=createGame(82);for(let y=35;y<40;y++)for(let x=0;x<10;x++)if(x!==7&&y>35+(x%3))s.board[y*10+x]=[6,3,1,7,2][(x+y)%5];s.active={kind:'T',rotation:0,x:5,y:26};return s;},[]);
  const play=(mode:SoloMode)=>{unlockAudio();local.start(mode);(document.activeElement as HTMLElement)?.blur();};
  return <div className="app-shell"><header className="site-header"><button className="brand" onClick={()=>{local.stop();setOnlineOpen(false);}} aria-label="STACKLANE ホーム"><span className="brand-mark"><i/><i/><i/></span><span>STACKLANE<small>FALL INTO YOUR FLOW.</small></span></button><nav><a href="https://github.com/iorin-elmo/tetris" target="_blank" rel="noreferrer" className="source-link">GitHub ↗</a><span className="header-status"><i className="dot"/> PLAY YOUR WAY</span><button className="settings-trigger" onClick={()=>{if(local.view&&!local.view.paused)local.pause();setSettings(true);}} aria-label="設定を開く">⚙<span>設定</span></button></nav></header>
  {local.view?<GameView {...local.view} prefs={prefs} onPause={local.pause} onBack={local.stop} onRetry={()=>play(local.view!.mode)}/>:<main className="home-page"><div className="home-intro"><div className="hero-copy"><span className="eyebrow"><span className="tiny-cross">✳</span> A LITTLE FOCUS. A LOT OF FUN.</span><h1>ひと息、<br/><em>積み上げよう。</em></h1><p>ひとりで記録に挑む。仲間と腕を競う。<br/>あなたのペースで楽しむ、落ち物パズル。</p><div className="hero-meta"><span><i className="dot"/> ブラウザですぐにプレイ</span><span>KEYBOARD + GAMEPAD</span></div></div><div className="hero-art" aria-hidden="true"><span className="art-label">FIND YOUR FLOW <span>↘</span></span><div className="preview-field"><Board state={preview} prefs={prefs}/></div><div className="floating-label"><span>GOOD THINGS<br/>TAKE SHAPE.</span><i>✳</i></div></div></div>
  <section className="mode-section"><div className="section-heading"><h2>さあ、何して遊ぶ？</h2><span>CHOOSE YOUR SESSION <span>↙</span></span></div><div className="mode-grid"><button className="mode-card marathon-card" onClick={()=>play('marathon')}><div className="card-top"><span>01 / SOLO</span><span className="mode-symbol">▥</span></div><h3>MARATHON</h3><p>じっくり積んで、150ライン。<br/>自分だけのリズムを見つけよう。</p><div className="card-bottom"><span>マラソン</span><b>↗</b></div></button><button className="mode-card sprint-card" onClick={()=>play('sprint')}><div className="card-top"><span>02 / TIME ATTACK</span><span className="mode-symbol">ϟ</span></div><h3>40 LINES</h3><p>40ライン、その先の自己ベストへ。<br/>一瞬のひらめきを、最速の一手に。</p><div className="card-bottom"><span>タイムアタック</span><b>↗</b></div></button><button className="mode-card cpu-card" onClick={()=>play('cpu')}><div className="card-top"><span>03 / VS COMPUTER</span><span className="mode-symbol">⌘</span></div><h3>CPU BATTLE</h3><p>いつでも気軽に腕試し。<br/>手強いライバルと対戦しよう。</p><div className="card-bottom"><span>CPU対戦</span><b>↗</b></div></button></div></section>
  <section className="online-banner"><div className="online-icon">↗<span>↙</span></div><div><span className="eyebrow">BETTER TOGETHER / 2–10 PLAYERS</span><h2>次は、みんなで。</h2><p>招待コードで集まろう。フリー対戦も、チーム戦も。</p></div><button className="button primary" onClick={()=>setOnlineOpen(true)}>オンラインで遊ぶ ↗</button></section>
  {bests().length>0&&<section className="records"><span className="eyebrow">YOUR PERSONAL BEST</span><div>{(['sprint','marathon'] as const).map(mode=>{const b=bests().find(b=>b.mode===mode);return b&&<p key={mode}><span>{mode==='sprint'?'40 LINES':'MARATHON'}</span><strong>{mode==='sprint'?formatTime(b.time):Math.round(b.score).toLocaleString()}</strong><small>{b.lines} LINES</small></p>;})}</div></section>}
  <footer className="site-footer"><span>STACKLANE <i>© 2026</i></span><span>NO DOWNLOAD. JUST ONE MORE GAME.</span><span>MADE FOR YOUR NEXT BREAK.</span></footer></main>}
  {settings&&<Settings prefs={prefs} onChange={setPrefs} onClose={()=>setSettings(false)}/>}
  {onlineOpen&&<div className="overlay"><div className="modal compact"><h2>オンライン対戦</h2><p>対戦サーバーの機能を準備しています。</p><button className="button secondary wide" onClick={()=>setOnlineOpen(false)}>閉じる</button></div></div>}
  </div>;
}
