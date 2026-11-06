import { useState } from 'react';
import type { Preferences } from '../settings/store';
export function Connect({
  prefs,
  onPrefs,
  onCreate,
  onJoin,
  onClose,
  error,
  status,
}: {
  prefs: Preferences;
  onPrefs: (p: Preferences) => void;
  onCreate: (name: string, password: string) => Promise<void>;
  onJoin: (code: string, name: string, password: string) => Promise<void>;
  onClose: () => void;
  error: string;
  status: string;
}) {
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || ''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState('');
  const run = async (create: boolean) => {
    setBusy(true);
    setLocalError('');
    try {
      if (create) await onCreate(prefs.displayName.trim() || 'PLAYER', password);
      else await onJoin(code.trim().toUpperCase(), prefs.displayName.trim() || 'PLAYER', password);
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '接続できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay">
      <div className="modal compact">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">LET'S PLAY TOGETHER</span>
            <h2>オンラインで遊ぶ</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="接続画面を閉じる">
            ×
          </button>
        </div>
        <p>部屋を作って仲間を招待するか、招待コードで参加できます。</p>
        <label>
          ゲスト名
          <input
            maxLength={20}
            value={prefs.displayName}
            onChange={(e) => onPrefs({ ...prefs, displayName: e.target.value })}
          />
        </label>
        <label>
          パスワード（設定する場合）
          <input
            type="password"
            maxLength={100}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button className="button primary wide" disabled={busy} onClick={() => void run(true)}>
          {busy ? '接続中…' : '新しい部屋を作る ↗'}
        </button>
        <div className="or-divider">
          <span>OR JOIN A ROOM</span>
        </div>
        <label>
          招待コード
          <input
            aria-label="招待コード"
            className="code-input"
            placeholder="8F3KQ7MZ"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button
          className="button secondary wide"
          disabled={busy || code.length < 8}
          onClick={() => void run(false)}
        >
          コードで参加する →
        </button>
        {(localError || error) && (
          <p className="error" role="alert">
            {localError || error}
          </p>
        )}
        <p className="muted connection-detail">
          <i className="dot" />
          {status === 'connected' ? '接続済み' : status === 'connecting' ? '接続しています' : '未接続'} ·{' '}
          {prefs.wsUrl.replace(/^wss?:\/\//, '')}
        </p>
      </div>
    </div>
  );
}
