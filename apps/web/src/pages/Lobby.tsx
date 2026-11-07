import { useEffect, useState } from 'react';
import { type RoomSnapshot, type BalancePreview } from '../../../../packages/protocol/src/index';
import { type Rules, type AttackRules } from '../../../../packages/rulesets/src/index';
import { type Preferences } from '../settings/store';
const targetLabels: Record<Rules['targeting'], string> = {
  manual: '手動選択',
  random: 'ランダム',
  all_equal: '全員に均等配分',
  attackers: '自分を攻撃中の相手',
  danger: '危険な相手',
  badges_like: 'KOの多い相手',
};
const attackLabels: Record<keyof AttackRules, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  tetris: 'Tetris',
  tSpinZero: 'T-Spin 0',
  tSpinMiniZero: 'Mini 0',
  tSpinMiniSingle: 'Mini Single',
  tSpinMiniDouble: 'Mini Double',
  tSpinSingle: 'T-Spin Single',
  tSpinDouble: 'T-Spin Double',
  tSpinTriple: 'T-Spin Triple',
  perfectClear: 'Perfect Clear',
  b2bBonus: 'B2B追加',
  renBonus: 'REN追加',
  perfectClearPolicy: 'PC方針',
  enableNonTSpinBonus: '非Tボーナス',
  nonTSpinBonuses: '非T詳細',
};
type NumericKey = { [K in keyof Rules]: Rules[K] extends number ? K : never }[keyof Rules];
export function Lobby({
  room,
  id,
  prefs,
  action,
  onLeave,
  balance,
  countdown,
  latency,
  error,
}: {
  room: RoomSnapshot;
  id: string;
  prefs: Preferences;
  action: (type: string, data?: Record<string, unknown>) => Promise<void>;
  onLeave: () => Promise<void>;
  balance: BalancePreview | null;
  countdown: number | null;
  latency: number;
  error: string;
}) {
  const [draft, setDraft] = useState(room.settings),
    [tab, setTab] = useState('general'),
    [copied, setCopied] = useState(''),
    [busy, setBusy] = useState(false),
    [remaining, setRemaining] = useState(3);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  useEffect(() => setSelectedCandidate(0), [balance?.previewId]);
  const host = room.hostId === id,
    me = room.members.find((p) => p.id === id),
    playing = room.status === 'playing' || room.status === 'countdown';
  useEffect(() => setDraft(room.settings), [JSON.stringify(room.settings)]);
  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(
      () => setRemaining(Math.max(0, Math.ceil((countdown - Date.now()) / 1000))),
      100,
    );
    return () => clearInterval(timer);
  }, [countdown]);
  const run = (type: string, data: Record<string, unknown> = {}) => {
    void action(type, data).catch(() => {});
  };
  const copy = async (invite: boolean) => {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('room', room.code);
    try {
      await navigator.clipboard.writeText(invite ? url.toString() : room.code);
      setCopied(invite ? '招待リンクをコピーしました' : 'コードをコピーしました');
    } catch {
      setCopied(`コード: ${room.code}`);
    }
  };
  const numeric = (key: NumericKey, label: string, min: number, max: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft[key]}
        onChange={(e) =>
          setDraft({ ...draft, [key]: Math.min(max, Math.max(min, Math.round(+e.target.value))) })
        }
      />
    </label>
  );
  const check = (key: keyof Rules, label: string) => (
    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={!!draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  const save = async () => {
    setBusy(true);
    try {
      await action('room.updateSettings', { expectedRevision: room.revision, patch: draft });
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="lobby-page">
      <div className="game-toolbar">
        <div>
          <h1>ROOM LOBBY</h1>
        </div>
        <div className="toolbar-actions">
          <span className="tag">
            <i className="dot" />
            {latency} ms
          </span>
          <button className="button secondary" onClick={() => void onLeave()}>
            退出する ↗
          </button>
        </div>
      </div>
      <section className="invite-panel">
        <div>
          <span className="eyebrow">INVITE CODE</span>
          <strong className="room-code">{room.code}</strong>
          <p>
            {room.name} {room.passwordProtected ? ' · パスワードあり' : ''}
          </p>
        </div>
        <div className="invite-actions">
          <button className="button secondary" onClick={() => void copy(false)}>
            コードをコピー
          </button>
          <button className="button primary" onClick={() => void copy(true)}>
            招待リンクをコピー ↗
          </button>
          {copied && <small role="status">{copied}</small>}
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="lobby-columns">
        <section className="members-panel">
          <div className="panel-heading">
            <h2>
              プレイヤー{' '}
              <small>
                {room.members.length} / {room.settings.maxPlayers}
              </small>
            </h2>
            <span className="eyebrow">{room.settings.mode === 'team' ? 'TEAM MATCH' : 'FREE FOR ALL'}</span>
          </div>
          {room.settings.mode === 'team' && (
            <div className="team-summary">
              {Array.from({ length: room.settings.teamCount }, (_, team) => (
                <div className={`team-color-${team}`} key={team}>
                  <span style={{ color: room.settings.teamColors[team] }}>
                    {room.settings.teamNames[team]}
                  </span>
                  <strong>
                    {room.members.filter((p) => p.team === team).length}
                    <small> / 6</small>
                  </strong>
                </div>
              ))}
            </div>
          )}
          <div className="member-list">
            {room.members.map((p, index) => (
              <article className="member-row" key={p.id}>
                <span className={`avatar team-color-${p.team}`}>{String(index + 1).padStart(2, '0')}</span>
                <div className="member-info">
                  <strong>
                    {p.name} {p.id === id && <small>YOU</small>}{' '}
                    {p.id === room.hostId && <b title="部屋主">♛</b>}
                  </strong>
                  <span>
                    {p.connected
                      ? p.spectator
                        ? '観戦 / 次の試合待ち'
                        : p.ready
                          ? 'READY'
                          : 'CONNECTED'
                      : '再接続待ち（30秒）'}{' '}
                    ·{' '}
                    {p.skill.matches
                      ? `推定スキル ${p.skill.value.toFixed(2)} / ${p.skill.matches}戦`
                      : 'スキル暫定・低信頼度'}
                  </span>
                </div>
                <div className="member-actions">
                  {room.settings.mode === 'team' && (
                    <select
                      aria-label={`${p.name}のチーム`}
                      disabled={playing || (!host && p.id !== id)}
                      value={p.team}
                      onChange={(e) => run('team.assign', { targetId: p.id, team: +e.target.value })}
                    >
                      {Array.from({ length: room.settings.teamCount }, (_, i) => (
                        <option value={i} key={i}>
                          {room.settings.teamNames[i]}
                        </option>
                      ))}
                    </select>
                  )}
                  {host && p.id !== id && (
                    <details>
                      <summary aria-label={`${p.name}の操作`}>···</summary>
                      <div className="member-menu">
                        <button
                          disabled={!p.connected}
                          onClick={() => run('room.transferHost', { targetId: p.id })}
                        >
                          部屋主を譲る
                        </button>
                        <button onClick={() => run('room.kick', { targetId: p.id })}>退出させる</button>
                      </div>
                    </details>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="lobby-controls">
            <button
              className="button secondary"
              disabled={playing}
              onClick={() => run('room.ready', { ready: !me?.ready })}
            >
              {me?.ready ? 'READYを解除' : 'READY ✓'}
            </button>
            {host && room.settings.mode === 'team' && (
              <button
                className="button secondary"
                disabled={playing || room.members.length < 2}
                onClick={() => run('team.autobalance.preview', { seed: 20261107, headcountPenalty: 0.05 })}
              >
                自動バランス
              </button>
            )}
          </div>
          {balance && room.settings.mode === 'team' && (
            <div className="balance-preview">
              <span className="eyebrow">BALANCE PREVIEW</span>
              <label>
                候補
                <select value={selectedCandidate} onChange={(e) => setSelectedCandidate(+e.target.value)}>
                  {balance.alternatives.map((c, i) => (
                    <option key={i} value={i}>
                      候補 {i + 1} / 偏差指標 {c.score.toFixed(3)}
                    </option>
                  ))}
                </select>
              </label>
              <p>推定値に基づく候補です。勝率を保証するものではありません。</p>
              {(balance.alternatives[selectedCandidate] ?? balance).teams.map((t) => (
                <div key={t.team}>
                  <strong>TEAM {t.team + 1}</strong>
                  <span>
                    {room.members
                      .filter(
                        (p) =>
                          (balance.alternatives[selectedCandidate] ?? balance).assignments[p.id] === t.team,
                      )
                      .map((p) => p.name)
                      .join('、') || '—'}
                  </span>
                  <small>
                    合計 {t.skill.toFixed(2)} / 信頼度 {Math.round(t.confidence * 100)}%
                  </small>
                </div>
              ))}
              <button
                className="button primary wide"
                disabled={!host || playing || balance.revision !== room.revision}
                onClick={() =>
                  run('team.autobalance.apply', {
                    previewId: balance.previewId,
                    candidate: selectedCandidate,
                  })
                }
              >
                この分け方を適用
              </button>
            </div>
          )}
          <div className="room-start">
            <div>
              <span className="eyebrow">NEXT MATCH</span>
              <p>{host ? '準備ができたら、はじめよう。' : '部屋主が開始するのを待っています。'}</p>
            </div>
            <button
              className="button primary wide"
              disabled={!host || playing || room.members.filter((p) => p.connected).length < 2}
              onClick={() => run('room.start')}
            >
              {playing ? '試合が進行中' : `対戦をはじめる ↗`}
            </button>
            <p className="muted">
              {room.settings.requireReady
                ? '全員のREADYが必要です。'
                : 'READYに関係なく、接続中の2人以上で開始できます。'}
            </p>
          </div>
        </section>
        <section className="rules-panel">
          <div className="panel-heading">
            <h2>ルール設定</h2>
            <span className="eyebrow">{host ? 'HOST CONTROLS' : 'HOST ONLY'}</span>
          </div>
          <div className="tabs">
            {[
              ['general', '基本'],
              ['attack', '火力'],
              ['garbage', 'おじゃま'],
              ['input', '操作'],
            ].map(([id, label]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <fieldset disabled={!host || busy}>
            {tab === 'general' && (
              <>
                <label>
                  対戦モード
                  <select
                    value={draft.mode}
                    onChange={(e) => setDraft({ ...draft, mode: e.target.value as Rules['mode'] })}
                  >
                    <option value="ffa">FFA — 個人戦</option>
                    <option value="team">TEAM — チーム戦</option>
                  </select>
                </label>
                <label>
                  ターゲット方式
                  <select
                    value={draft.targeting}
                    onChange={(e) => setDraft({ ...draft, targeting: e.target.value as Rules['targeting'] })}
                  >
                    {Object.entries(targetLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-columns">
                  {numeric('maxPlayers', '最大人数', 2, 10)}
                  {numeric('teamCount', 'チーム数', 1, 4)}
                  {numeric('maxPlayersPerTeam', 'チームの定員', 1, 6)}
                  {numeric('fieldWidth', '盤面の幅', 5, 20)}
                  {numeric('visibleHeight', '表示行数', 16, 30)}
                  {numeric('nextCount', 'NEXT表示数', 1, 10)}
                  {numeric('hiddenHeight', '隠し行数', 4, 30)}
                </div>
                {draft.mode === 'team' &&
                  Array.from({ length: draft.teamCount }, (_, i) => (
                    <div className="form-columns" key={i}>
                      <label>
                        チーム {i + 1} の名前
                        <input
                          maxLength={16}
                          value={draft.teamNames[i]}
                          onChange={(e) => {
                            const teamNames = [...draft.teamNames];
                            teamNames[i] = e.target.value;
                            setDraft({ ...draft, teamNames });
                          }}
                        />
                      </label>
                      <label>
                        チーム色
                        <input
                          type="color"
                          value={draft.teamColors[i]}
                          onChange={(e) => {
                            const teamColors = [...draft.teamColors];
                            teamColors[i] = e.target.value;
                            setDraft({ ...draft, teamColors });
                          }}
                        />
                      </label>
                    </div>
                  ))}
                {check('holdEnabled', 'HOLDを有効にする')}
                <label>
                  配牌
                  <select
                    aria-label="配牌"
                    value={draft.sharedSequence ? 'shared' : 'individual'}
                    onChange={(e) => setDraft({ ...draft, sharedSequence: e.target.value === 'shared' })}
                  >
                    <option value="shared">全員共通</option>
                    <option value="individual">プレイヤー別</option>
                  </select>
                </label>
                {check('forceGhost', 'ゴーストを全員に表示')}
                {check('requireReady', '開始に全員のREADYを必要とする')}
                {check('allowSpectators', '観戦を許可')}
                {check('allowLateJoinAsSpectator', '途中参加を次試合待ちで許可')}
              </>
            )}
            {tab === 'attack' && (
              <>
                <p className="muted">火力は送信するおじゃまのライン数です。</p>
                <div className="form-columns">
                  {Object.entries(draft.attackRules)
                    .filter(([, v]) => typeof v === 'number')
                    .map(([key, value]) => (
                      <label key={key}>
                        {attackLabels[key as keyof AttackRules]}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={value as number}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              attackProfile: 'custom',
                              attackRules: {
                                ...draft.attackRules,
                                [key]: Math.min(100, Math.max(0, +e.target.value)),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                </div>
                <label>
                  REN追加（表示0 RENから、カンマ区切り）
                  <input
                    value={draft.attackRules.renBonus.join(',')}
                    onChange={(e) => {
                      if (/^[\d,]*$/.test(e.target.value))
                        setDraft({
                          ...draft,
                          attackProfile: 'custom',
                          attackRules: {
                            ...draft.attackRules,
                            renBonus: e.target.value
                              .split(',')
                              .slice(0, 64)
                              .map((v) => Math.min(100, +v)),
                          },
                        });
                    }}
                  />
                </label>
                <label>
                  Perfect Clear
                  <select
                    value={draft.attackRules.perfectClearPolicy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attackProfile: 'custom',
                        attackRules: {
                          ...draft.attackRules,
                          perfectClearPolicy: e.target.value as AttackRules['perfectClearPolicy'],
                        },
                      })
                    }
                  >
                    <option value="replace-base">置換（REN・B2Bを重ねない）</option>
                    <option value="add-to-base">加算（カスタム）</option>
                  </select>
                </label>
              </>
            )}
            {tab === 'garbage' && (
              <>
                <label>
                  ガベージ方式
                  <select
                    value={draft.garbageStyle}
                    onChange={(e) =>
                      setDraft({ ...draft, garbageStyle: e.target.value as Rules['garbageStyle'] })
                    }
                  >
                    <option value="ppt2">ぷよテト風</option>
                    <option value="tetrio">TETR.IO風</option>
                  </select>
                </label>
                <div className="form-columns">
                  {numeric('garbageTravelTicks', '移動時間 (tick)', 0, 600)}
                  {numeric('garbageActivationTicks', '有効化待ち (tick)', 0, 600)}
                  {numeric('garbageCapPerLock', '1固定の挿入上限', 1, 40)}
                </div>
                <label>
                  穴の変化率 ({draft.messiness.toFixed(2)})
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.messiness}
                    onChange={(e) => setDraft({ ...draft, messiness: +e.target.value })}
                  />
                </label>
                <label>
                  消去による上昇延期
                  <select
                    value={draft.blockingMode}
                    onChange={(e) =>
                      setDraft({ ...draft, blockingMode: e.target.value as Rules['blockingMode'] })
                    }
                  >
                    <option value="clear">延期する</option>
                    <option value="none">延期しない（TETR.IO風のみ）</option>
                  </select>
                </label>
                <p className="muted">
                  ガベージ方式を変更しても火力表は変わりません。待ち時間や穴の変化は未実測のプロジェクト既定値です。
                </p>
              </>
            )}
            {tab === 'input' && (
              <>
                <label>
                  個人のDAS / ARR設定
                  <select
                    value={draft.inputPolicy}
                    onChange={(e) =>
                      setDraft({ ...draft, inputPolicy: e.target.value as Rules['inputPolicy'] })
                    }
                  >
                    <option value="free">自由</option>
                    <option value="restricted">範囲を制限</option>
                    <option value="locked">部屋の値に固定 🔒</option>
                  </select>
                </label>
                <div className="form-columns">
                  {numeric('dasMs', 'DAS (ms)', 0, 500)}
                  {numeric('arrMs', 'ARR (ms)', 0, 200)}
                  {numeric('gravityTicks', '1マス落下までのtick', 1, 3600)}
                  {numeric('lockDelayTicks', '接地猶予 (tick)', 0, 600)}
                  {numeric('lockResetLimit', '接地リセット上限', 0, 100)}
                  {numeric('softDropFactor', 'ソフトドロップ倍率', 1, 100)}
                  {numeric('entryDelayTicks', '出現待ち (tick)', 0, 120)}
                  {numeric('lineClearDelayTicks', '消去待ち (tick)', 0, 120)}
                  {numeric('inputDelayTicks', '入力猶予 (tick)', 0, 12)}
                </div>
                {draft.inputPolicy === 'restricted' &&
                  (['dasBounds', 'arrBounds'] as const).map((key) => (
                    <div className="form-columns" key={key}>
                      {[0, 1].map((i) => (
                        <label key={i}>
                          {key === 'dasBounds' ? 'DAS' : 'ARR'} {i ? '上限' : '下限'}
                          <input
                            type="number"
                            min={0}
                            max={key === 'dasBounds' ? 500 : 200}
                            value={draft[key][i]}
                            onChange={(e) => {
                              const value = [...draft[key]] as [number, number];
                              value[i] = Math.max(0, +e.target.value);
                              setDraft({ ...draft, [key]: value });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                <p className="muted">
                  60 tick = 1秒。試合開始時の設定を使用し、進行中の試合には変更を適用しません。
                </p>
              </>
            )}
            <button className="button primary wide" onClick={() => void save()}>
              {busy ? '保存中…' : playing ? '次の試合用に保存' : 'ルールを保存 ✓'}
            </button>
          </fieldset>
          <div className="rules-footer">
            {room.settings.inputPolicy === 'locked'
              ? `🔒 DAS ${room.settings.dasMs} / ARR ${room.settings.arrMs} ms`
              : room.settings.inputPolicy === 'restricted'
                ? '入力設定に範囲制限あり'
                : `あなたの入力設定: DAS ${prefs.dasMs} / ARR ${prefs.arrMs} ms`}
            <br />
            {room.settings.ruleVersion}
          </div>
        </section>
      </div>
      {countdown && (
        <div className="overlay">
          <div className="countdown">
            <span className="eyebrow">GET READY</span>
            <strong>{remaining || 'GO'}</strong>
            <p>まもなく対戦を開始します</p>
          </div>
        </div>
      )}
    </main>
  );
}
