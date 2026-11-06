# STACKLANE

ひと息、積み上げよう。Raspberry Piの対戦サーバーとGitHub Pagesのブラウザ画面で遊べる、独自デザインの落ち物パズルです。

**[ブラウザで遊ぶ](https://iorin-elmo.github.io/tetris/)** · [設計仕様](docs/design.md) · [ラズパイへの配備](docs/operation/raspberry-pi.md) · [検証記録](docs/verification/progress.md)

## モード

- **MARATHON**：150ライン、レベル上昇、スコア記録。エンドレスも設定可能。
- **40 LINES**：40ラインのタイムアタック。自己ベストをブラウザに保存。
- **CPU BATTLE**：CPU 1〜9体、3段階の難易度。合法手探索と盤面評価、HARDは上位候補の2手読み。
- **オンラインFFA**：招待コード・URLで2〜10人。最後の1人が勝利。
- **チーム戦**：最大4チーム、1チーム最大6人。人数差・空チームを許容し、最後の生存チームが勝利。

オンラインは `wss://tetris.server-on.net/ws` のサーバー起動後に利用できます。ソロ・CPU戦はサーバーがなくても遊べます。スマホはロビー・観戦を優先し、タッチ対戦は対象外です。

## 操作

| 操作           | キーボード | パッド（Xbox表記）          |
| -------------- | ---------- | --------------------------- |
| 左右           | ← / →      | 十字キー左右 / 左スティック |
| ソフトドロップ | ↓          | 十字キー下 / 左スティック下 |
| ハードドロップ | ↑          | 十字キー上                  |
| 右 / 左回転    | X / Z      | B / A                       |
| HOLD           | C          | LB                          |
| 照準切替       | Q / E      | LT / RT                     |
| メニュー       | Escape     | Start                       |

設定でキーボードとパッドの割当を別々に変更できます。パッドの選択・スティック割当・デッドゾーン、DAS/ARR、音量、配色・輪郭・模様・ゴーストを保存します。メニューは十字キーで移動、Aで選択、Bで戻ります。パッドはブラウザで一度ボタンを押して認識させてください。

部屋主はルール、入力制限、火力、ガベージ、ターゲット方式、ホスト移譲、チーム分けを操作できます。自動バランスは直近の有効戦績のPPS/APM/APPを使い、3候補を確認して適用します。新規ゲストは低信頼度の暫定評価です。

## 開発・起動

Node.js **24.12以降**、pnpm **12.8.1** を使用します。SQLiteはNode標準モジュールを使うため、追加のネイティブDBモジュールは不要です。

```sh
npm install --global pnpm@12.8.1
pnpm install --frozen-lockfile
pnpm run dev
```

http://127.0.0.1:5173/ を開きます。Webは5173、サーバーは `127.0.0.1:3001` です。ブラウザの独立したプロファイル/シークレットウィンドウ2つでPC内対戦ができます。同じ保存領域は同一ゲストとして復帰します。

```sh
pnpm run typecheck
pnpm run test
pnpm exec playwright install chromium
pnpm run test:e2e
pnpm run build
pnpm start
```

ビルド出力は `apps/web/dist/` と `apps/server/dist/index.js` です。本番設定は [config/server.env.example](config/server.env.example) を参照。開発時のサーバー環境変数はシェル、本番はsystemdのEnvironmentFileで設定します。

## GitHub Pagesとラズパイ

`main`へのpushで型検査・単体/WS統合テスト・E2EをCI実行し、Pagesの別ワークフローで静的画面を公開します。Pages用のbaseは `/tetris/`、接続先はRepository variable `VITE_WS_URL` で変更できます。

```text
Browser → HTTPS → GitHub Pages（画面）
Browser → WSS → tetris.server-on.net:443 → Caddy → 127.0.0.1:3001
                                                     └ SQLite（WAL）
```

Docker不要です。[配備手順](docs/operation/raspberry-pi.md) にsystemd、MyDNS、TLS、ルーター、バックアップ/復元、更新/ロールバックを記載しています。MyDNS認証情報はラズパイの `/etc/stacklane/mydns.env` にだけ置きます。公開用の `VITE_` 変数には秘密を入れません。

## 構成

```text
apps/web/            React + Vite + Canvas / 入力・予測・ロビー
apps/server/         WS / 部屋・対戦・認可・SQLite
packages/engine/     純粋な60Hzエンジン、SRS 90度、7-bag、火力・相殺
packages/rulesets/   ランタイム検証と PROJECT_DEFAULT
packages/protocol/   バージョン付きDTO・厳密な受信スキーマ
packages/bot/        CPUの合法手列挙・評価
deploy/             systemd / Caddy / nginx代替 / MyDNS
scripts/            ベンチマーク・バックアップ・リプレイ検証
tests/              WS統合・ブラウザE2E
docs/               設計・ルール・通信・運用・検証
```

ブラウザが入力を即時予測し、サーバーが同じエンジンを60Hzで再演算して攻撃・相殺・KO・勝敗・統計を決めます。10Hzの状態更新から未確認入力を再実行します。開始時のルールは不変です。相手・観戦者に未来NEXTやPRNG状態は送信しません。[通信仕様](docs/protocol/websocket.md) を参照してください。

復帰にはランダムな秘密トークンを使います。30秒の猶予中も重力は進行し、猶予超過でホストを移譲します。ゲスト識別/成績/対戦記録はSQLite、部屋・進行中の試合はメモリに置きます。サーバー再起動後は新しい部屋を作ってください。

```sh
pnpm run benchmark
pnpm run db:backup backups/stacklane.sqlite
pnpm run replay <match-id>
```

リプレイはDBの初期シード・受理入力・照準・切断/退出から再計算し、保存した最終統計を照合します。DBとバックアップはGit管理しません。

## 参照仕様と未確認事項

標準火力は設計書のPPT2テトリス同士の表を採用します。PCは10への置換、B2Bは2回目から加算。Mini例外、PCとの重複加算、DAS/ARR、ガベージの穴・時間仕様は未実測の **PROJECT_DEFAULT** です。TETR.IO風ガベージでも火力は変わりません。180度回転と非Tスピンの追加火力は対象外です。[ルールの定義](docs/rules/project-default.md) を参照してください。

原作実機・ラズパイ実機・物理パッド・実インターネットWSSの確認状況は [検証記録](docs/verification/progress.md) に記載します。公式の画像・ロゴ・音楽・キャラクターは使用していません。
