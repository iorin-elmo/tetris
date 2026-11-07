import { useEffect, useMemo, useState } from 'react';
import { createGame } from '../../../../packages/engine/src/index';
import { Controller } from '../input/controller';
import { useLocalGame, type SoloMode } from '../game/useLocalGame';
import { GameView, formatTime } from '../components/GameView';
import { loadPreferences, bests, savePreferences } from '../settings/store';
import { unlockAudio } from '../game/audio';
import { Settings } from '../settings/Settings';
import { useOnline } from '../network/useOnline';
import { Connect } from '../network/Connect';
import { Lobby } from './Lobby';
import { useGamepadNavigation } from '../input/useGamepadNavigation';
export function App() {
  const [prefs, setPrefs] = useState(loadPreferences),
    [settings, setSettings] = useState(false),
    [onlineOpen, setOnlineOpen] = useState(new URLSearchParams(location.search).has('room'));
  const controller = useMemo(() => new Controller(prefs), []);
  controller.prefs = prefs;
  controller.blocked = settings;
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => {
    savePreferences(prefs);
  }, [prefs]);
  const local = useLocalGame(controller, prefs);
  const online = useOnline(controller, prefs),
    game = online.view.game;
  useEffect(() => {
    if (online.view.room) setOnlineOpen(false);
  }, [online.view.room?.code]);
  useGamepadNavigation(
    prefs,
    settings || onlineOpen || !!local.view?.paused || !!game?.menu || (!local.view && !game),
    () => {
      if (settings) setSettings(false);
      else if (onlineOpen) setOnlineOpen(false);
      else if (local.view?.paused) local.pause();
      else if (game?.menu) online.menu();
      else setSettings(true);
    },
    settings || onlineOpen || (!local.view && !game),
  );
  const leave = () => online.leave().catch(() => {});
  const onlineContent = game ? (
    <>
      <GameView
        state={game.state}
        rules={game.selfRules}
        prefs={prefs}
        mode={game.rules.mode}
        opponents={game.players
          .filter(
            (p) => p.id !== (game.spectator ? game.players.find((p) => p.state.alive)?.id : online.view.id),
          )
          .map((p) => ({ ...p, state: { ...createGame(1, game.rules), ...p.state, queue: [], rng: 0 } }))}
        result={game.result}
        paused={game.menu}
        message={game.message}
        feedback={game.feedback}
        target={game.target}
        onTarget={online.target}
        onPause={online.menu}
        onBack={() => void leave()}
        onRetry={online.returnToLobby}
        online
        spectator={game.spectator}
      />
      {online.view.status === 'reconnecting' && (
        <div className="connection-banner" role="status">
          接続が切れました。復帰を試みています…（30秒の復帰猶予）
        </div>
      )}
      {online.view.error && (
        <button className="connection-banner error" onClick={online.dismissError}>
          {online.view.error} ×
        </button>
      )}
    </>
  ) : online.view.room ? (
    <Lobby
      room={online.view.room}
      id={online.view.id!}
      prefs={prefs}
      action={online.action}
      onLeave={leave}
      balance={online.view.balance}
      countdown={online.view.countdown}
      latency={online.view.latency}
      error={online.view.error}
    />
  ) : null;
  const play = (mode: SoloMode) => {
    unlockAudio();
    local.start(mode);
    (document.activeElement as HTMLElement)?.blur();
  };
  return (
    <div className={`app-shell ${prefs.reducedMotion ? 'reduced-motion' : ''}`}>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            local.stop();
            if (online.view.room) void leave();
            setOnlineOpen(false);
          }}
          aria-label="TETRIS ホーム"
        >
          TETRIS
        </button>
        <nav>
          <a
            href="https://github.com/iorin-elmo/tetris"
            target="_blank"
            rel="noreferrer"
            className="source-link"
          >
            GitHub ↗
          </a>
          <button
            className="settings-trigger"
            onClick={() => {
              if (local.view && !local.view.paused) local.pause();
              setSettings(true);
            }}
            aria-label="設定を開く"
          >
            ⚙<span>設定</span>
          </button>
        </nav>
      </header>
      {onlineContent ??
        (local.view ? (
          <GameView
            {...local.view}
            prefs={prefs}
            onPause={local.pause}
            onBack={local.stop}
            onRetry={() => play(local.view!.mode)}
            onTarget={local.target}
          />
        ) : (
          <main className="home-page">
            <h1 className="home-title">TETRIS</h1>
            <section className="mode-section" aria-label="モード選択">
              <button
                className="mode-row online-mode"
                onClick={() => setOnlineOpen(true)}
                aria-label="オンラインで遊ぶ"
              >
                <span className="mode-name">
                  MULTIPLAYER<small>オンライン対戦</small>
                </span>
                <span className="mode-detail">2–10人 / FFA・チーム戦</span>
                <span className="mode-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
              <button
                className="mode-row sprint-mode"
                onClick={() => play('sprint')}
                aria-label="40 LINES タイムアタック"
              >
                <span className="mode-name">
                  40 LINES<small>タイムアタック</small>
                </span>
                <span className="mode-detail">40ライン</span>
                <span className="mode-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
              <button
                className="mode-row marathon-mode"
                onClick={() => play('marathon')}
                aria-label="MARATHON マラソン"
              >
                <span className="mode-name">
                  MARATHON<small>マラソン</small>
                </span>
                <span className="mode-detail">{prefs.endless ? 'エンドレス' : '150ライン'}</span>
                <span className="mode-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
              <button
                className="mode-row cpu-mode"
                onClick={() => play('cpu')}
                aria-label="CPU BATTLE CPU対戦"
              >
                <span className="mode-name">
                  CPU BATTLE<small>CPU対戦</small>
                </span>
                <span className="mode-detail">{prefs.cpuCount} CPU</span>
                <span className="mode-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </section>
            {bests().length > 0 && (
              <section className="records" aria-label="自己ベスト">
                <h2>PERSONAL BEST</h2>
                <div>
                  {(['sprint', 'marathon'] as const).map((mode) => {
                    const b = bests().find((b) => b.mode === mode);
                    return (
                      b && (
                        <p key={mode}>
                          <span>{mode === 'sprint' ? '40 LINES' : 'MARATHON'}</span>
                          <strong>
                            {mode === 'sprint' ? formatTime(b.time) : Math.round(b.score).toLocaleString()}
                          </strong>
                        </p>
                      )
                    );
                  })}
                </div>
              </section>
            )}
          </main>
        ))}
      {settings && <Settings prefs={prefs} onChange={setPrefs} onClose={() => setSettings(false)} />}
      {onlineOpen && (
        <Connect
          prefs={prefs}
          onPrefs={setPrefs}
          onCreate={online.create}
          onJoin={online.join}
          onClose={() => setOnlineOpen(false)}
          error={online.view.error}
          status={online.view.status}
        />
      )}
    </div>
  );
}
