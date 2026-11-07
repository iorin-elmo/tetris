import { useMemo } from 'react';
import { Board, MiniPiece } from '../canvas/Board';
import { statistics, type GameState } from '../../../../packages/engine/src/index';
import type { Rules } from '../../../../packages/rulesets/src/index';
import type { Preferences } from '../settings/store';
import type { GameResult } from '../game/useLocalGame';
import { clearLabels, topoutLabels, warningLabels, type ClearFeedback } from '../game/feedback';
import { placementWarning } from '../game/danger';
export const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
export function GameView({
  state,
  rules,
  prefs,
  mode,
  opponents = [],
  paused = false,
  result,
  feedback,
  target,
  onTarget,
  onPause,
  onBack,
  onRetry,
  online = false,
  spectator = false,
}: {
  state: GameState;
  rules: Rules;
  prefs: Preferences;
  mode: string;
  opponents?: {
    id: string;
    name: string;
    state: GameState;
    team: number;
    ko?: number;
    target?: string | null;
  }[];
  paused?: boolean;
  result: GameResult | null;
  message: string;
  feedback?: ClearFeedback;
  target: string | null;
  onTarget?: (id: string) => void;
  onPause: () => void;
  onBack: () => void;
  onRetry: () => void;
  seed?: number;
  online?: boolean;
  spectator?: boolean;
}) {
  const stats = statistics(state),
    goal = mode === 'sprint' ? 40 : mode === 'marathon' && !prefs.endless ? 150 : 0;
  const warning = useMemo(() => placementWarning(state, rules), [state, rules]);
  const clear = feedback && state.tick - feedback.tick < 150 ? clearLabels(feedback.event) : null;
  const ren = Math.max(0, state.streak - 1);
  return (
    <main className="game-page">
      <div className="game-toolbar">
        <div>
          <h1>
            {mode === 'sprint'
              ? '40 LINES'
              : mode === 'marathon'
                ? 'MARATHON'
                : mode === 'cpu'
                  ? 'CPU BATTLE'
                  : mode === 'team'
                    ? 'TEAM BATTLE'
                    : 'FREE FOR ALL'}
          </h1>
        </div>
        <div className="toolbar-actions">
          <button className="button secondary" onClick={onPause}>
            {online ? 'メニュー' : '一時停止'} <kbd>ESC</kbd>
          </button>
        </div>
      </div>
      {spectator && <p className="notice">観戦中です。次の試合から参加できます。</p>}
      <div className={`play-layout ${opponents.length ? 'versus' : ''}`}>
        <section className="player-stage" aria-label="自分のゲーム">
          <aside className="hold-rail">
            <span className="rail-title">HOLD</span>
            <div className={`piece-slot ${state.holdUsed ? 'used' : ''}`}>
              <MiniPiece piece={state.hold} />
            </div>
            <span className="key-hint">{prefs.keyboard.hold.replace('Key', '')}</span>
            <div className="rail-metric">
              <span>PPS</span>
              <strong>{stats.pps.toFixed(2)}</strong>
            </div>
            <div
              className={`chain-display ${state.b2b ? 'active' : ''}`}
              aria-label={`B2B ${state.b2b ? '継続中' : 'なし'}`}
            >
              <span>B2B</span>
              <strong>{state.b2b ? 'ON' : '—'}</strong>
            </div>
            <div className={`ren-display ${ren > 0 ? 'active' : ''}`} aria-label={`${ren} REN`}>
              <strong>{ren > 0 ? ren : '—'}</strong>
              <span>REN</span>
            </div>
            <div className="clear-announcement" role="status" aria-live="polite" aria-atomic="true">
              {clear && (
                <div key={feedback!.tick} className="clear-event">
                  {clear.b2b && <span className="clear-b2b">BACK-TO-BACK</span>}
                  {clear.spin && <strong className="clear-spin">{clear.spin}</strong>}
                  {clear.clear && (
                    <strong className={`clear-type ${feedback!.event.lines === 4 ? 'four-lines' : ''}`}>
                      {clear.clear}
                    </strong>
                  )}
                  {clear.perfect && <strong className="clear-perfect">PERFECT CLEAR</strong>}
                  {clear.attack > 0 && (
                    <span className="clear-attack">
                      +{clear.attack} <small>ATTACK</small>
                    </span>
                  )}
                </div>
              )}
            </div>
          </aside>
          <div className="field-wrap">
            <div className="field-caption">
              <span>
                <i className="dot" /> {spectator ? 'SPECTATING' : 'YOU'}
              </span>
              <span>{!state.alive ? 'KO' : warning.reason ? 'DANGER' : ''}</span>
            </div>
            <div
              className={`field ${warning.reason ? 'fatal-placement' : warning.nearTop ? 'near-top' : ''}`}
            >
              <Board state={state} rules={rules} prefs={prefs} warning={warning} />
              <div className="garbage-gauge" title="受信待ちガベージ">
                <i
                  style={{
                    height: `${Math.min(100, (state.garbage.reduce((n, p) => n + p.lines, 0) / rules.visibleHeight) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className={`field-bottom ${warning.reason ? 'danger-text' : ''}`} role="status">
              <span>
                {!state.alive && state.topoutReason
                  ? topoutLabels[state.topoutReason]
                  : warning.reason
                    ? warningLabels[warning.reason]
                    : warning.nearTop
                      ? '赤枠：次のミノの出現位置'
                      : ''}
              </span>
            </div>
          </div>
          <aside className="next-rail">
            <span className="rail-title">
              NEXT <small>{rules.nextCount}</small>
            </span>
            <div className="next-list">
              {state.queue.slice(0, rules.nextCount).map((piece, i) => (
                <MiniPiece key={i} piece={piece} />
              ))}
            </div>
          </aside>
        </section>
        <aside className="match-sidebar">
          <div className="session-stats">
            <div>
              <span>TIME</span>
              <strong className="time-value">{formatTime(stats.elapsedActiveSeconds)}</strong>
            </div>
            <div>
              <span>LINES</span>
              <strong>
                {String(stats.linesCleared).padStart(3, '0')}
                <small>{goal ? ` / ${goal}` : ''}</small>
              </strong>
              {goal > 0 && (
                <div className="progress">
                  <i style={{ width: `${Math.min(100, (stats.linesCleared / goal) * 100)}%` }} />
                </div>
              )}
            </div>
            <div>
              <span>SCORE</span>
              <strong>{Math.round(stats.score).toLocaleString()}</strong>
            </div>
            <div className="stat-pair">
              <div>
                <span>APM</span>
                <strong>{stats.apm.toFixed(1)}</strong>
              </div>
              <div>
                <span>APP</span>
                <strong>{stats.app.toFixed(2)}</strong>
              </div>
            </div>
          </div>
          {opponents.length > 0 ? (
            <>
              <div className="opponents-heading">
                <span>PLAYERS</span>
                <span>{opponents.filter((p) => p.state.alive).length + Number(state.alive)} ALIVE</span>
              </div>
              <div className={`opponents-grid ${opponents.length > 3 ? 'many' : ''}`}>
                {opponents.map((p, i) => (
                  <button
                    className={`opponent ${target === p.id ? 'targeted' : ''} ${!p.state.alive ? 'knocked-out' : ''}`}
                    key={p.id}
                    onClick={() => onTarget?.(p.id)}
                    aria-label={`${p.name}をターゲットにする`}
                    aria-pressed={target === p.id}
                  >
                    <div className="opponent-name">
                      <span>
                        <i style={{ background: rules.teamColors[p.team % 4] }} />
                        {p.name}
                      </span>
                      <span>{target === p.id ? '◎' : String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <Board state={p.state} rules={rules} prefs={prefs} small label={`${p.name}の盤面`} />
                    <div className="opponent-footer">
                      {p.state.alive ? `${p.state.stats.linesCleared} LINES` : 'KNOCKED OUT'}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </div>
      <div className="controls-bar">
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> 移動
        </span>
        <span>
          <kbd>↓</kbd> 落下
        </span>
        <span>
          <kbd>{prefs.keyboard.hard.replace('ArrowUp', '↑')}</kbd> ドロップ
        </span>
        <span>
          <kbd>{prefs.keyboard.ccw.replace('Key', '')}</kbd>
          <kbd>{prefs.keyboard.cw.replace('Key', '')}</kbd> 回転
        </span>
        <span>
          <kbd>{prefs.keyboard.hold.replace('Key', '')}</kbd> HOLD
        </span>
        {online && <span className="controls-note">Q / E ターゲット切替</span>}
      </div>
      {paused && !result && (
        <div className="overlay">
          <div className="modal compact">
            <h2>{online ? 'メニュー' : 'PAUSED'}</h2>
            {online && <p>オンライン対戦はメニュー表示中も進行します。</p>}
            <button className="button primary wide" onClick={onPause}>
              ゲームに戻る
            </button>
            <button className="button secondary wide" onClick={onBack}>
              {online ? '部屋から退出する' : 'ホームに戻る'}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="overlay">
          <div className="modal results-modal">
            <h2>{result.title}</h2>
            {!state.alive && state.topoutReason && (
              <p className="defeat-reason">{topoutLabels[state.topoutReason]}</p>
            )}
            <div className="result-stats">
              <div>
                <span>TIME</span>
                <strong>{formatTime(stats.elapsedActiveSeconds)}</strong>
              </div>
              <div>
                <span>LINES</span>
                <strong>{stats.linesCleared}</strong>
              </div>
              <div>
                <span>SCORE</span>
                <strong>{Math.round(stats.score).toLocaleString()}</strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>順位 / PLAYER</th>
                    {rules.mode === 'team' && <th>チーム順位</th>}
                    <th>KO</th>
                    <th>PPS</th>
                    <th>APM</th>
                    <th>APP</th>
                    <th>送信 / 相殺</th>
                    <th>生存秒</th>
                  </tr>
                </thead>
                <tbody>
                  {result.standings.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.place}</b> {p.name}
                      </td>
                      {rules.mode === 'team' && (
                        <td>
                          {rules.teamNames[p.team]} #{p.teamPlace ?? '—'}
                        </td>
                      )}
                      <td>{p.ko}</td>
                      <td>{p.stats.pps.toFixed(2)}</td>
                      <td>{p.stats.apm.toFixed(1)}</td>
                      <td>{p.stats.app.toFixed(2)}</td>
                      <td>
                        {p.stats.attackSent} / {p.stats.attackCancelled}
                      </td>
                      <td>{p.stats.elapsedActiveSeconds.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={onBack}>
                {online ? '部屋から退出' : 'ホームへ'}
              </button>
              <button className="button primary" onClick={onRetry}>
                {online ? 'ロビーへ戻る' : 'もう一度プレイ'} ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
