# ブラウザ対戦型落ち物パズル ゲーム設計書

> Version 1.0 / 2026-11-06  
> 対象: コーディングAI・実装担当者  
> ステータス: 実装可能な基本仕様。原作の未検証細部は明示しており、検証前に「完全再現」を主張しないこと。

## 0. 最優先の指示

本書に従い、GitHub Pages に配置する静的 Web クライアントと、Raspberry Pi 上で稼働する対戦サーバーをモノレポで開発する。**1人用（マラソン・40 LINES・CPU対戦）、2〜10人のオンライン対戦、最大4チームのチーム戦、部屋主による詳細ルール設定、部屋参加コード/招待URL、ホスト権限移譲、PC/ゲームパッド両操作**を実装する。

- クライアントからの操作は即座に画面へ反映し、ネットワークの往復待ちをさせない。
- 勝敗・乱数・攻撃・ガベージ受領を最終的にサーバーが検証する。
- **標準プロファイルは『ぷよぷよテトリス2』のテトリス対テトリス戦を参照**する。別作品独自の火力テーブルをデフォルトと混ぜない。
- SRS（標準 Super Rotation System）を採用し、SRS+ を無断で混ぜない。
- 同一ルールエンジンをローカル・CPU戦・オンラインサーバーで共有する。
- 表中の初期値が原作資料で確証を得られない場合は `PROJECT_DEFAULT` と明記し、参照作品準拠であると偽らない。
- コード・テスト・README・デプロイ設定まで生成し、フェーズごとの受け入れ条件を満たして進める。

## 1. 想定するプレイ体験とスコープ

### 1.1 遊び方

| モード | 人数 | 達成条件 |
|---|---:|---|
| マラソン | 1 | 150ラインで完走。スコア・所要時間・レベルを記録。エンドレスは任意設定 |
| 40 LINES | 1 | 40ラインの最短タイム。テストでは固定シードも指定可能 |
| CPU対戦 | 1人 + CPU 1〜9体（初期UIは1体推奨） | 最後まで生き残る。CPU難易度調整 |
| オンライン FFA | 2〜10 | 最後の生存プレイヤーが勝利 |
| オンライン チーム戦 | 2〜10 | 最後に生き残ったチームが勝利 |

- オンラインは**部屋作成/参加のみ**。ランダムマッチ・ランクマッチ・アカウント認証・公開ルーム検索は当初不要。
- 試合終了後は結果画面から同じロビーに戻り、再戦できる。
- オンラインで途中参加した人は試合中は観戦/次試合待ち。進行中の試合には参戦させない。
- チーム戦では、生存チームが1つになった時点で決着（チーム内の個人の脱落はチーム敗北ではない）。
- チームが1つしか存在しない場合は開始禁止。**空チーム（0人）は定義可能だが試合に参加しない**。

### 1.2 非目標（初期リリース）

- ぷよぷよ自体のゲームエンジン、ぷよ vs テト異種対戦。
- 公式アセットや音楽の流用、公式サービスとの互換 API、公式ログイン。
- 大規模 MMOG / 99人対戦、金銭決済、グローバルランキング。
- 完璧なアンチチート保証。現実的な検証・レート制限・状態再同期で対処。

## 2. 技術構成

### 2.1 推奨技術

| 層 | 推奨技術 | 理由 |
|---|---|---|
| モノレポ | TypeScript / pnpm workspaces | 型・ロジックをクライアント/サーバーで共有 |
| クライアント | Vite + React + TypeScript | GitHub Pages で静的配信可能 |
| ゲーム描画 | Canvas 2D（必要なら後で PixiJS） | 60fps、10人表示時も低負荷 |
| ゲーム進行 | 純粋関数を中心にした TypeScript エンジン | 決定論・テスト・リプレイが容易 |
| サーバー | Node.js LTS + `ws` / Fastify | Raspberry Pi で運用可能、WebSocket 対応 |
| 通信 | WSS + JSON（後でバイナリ化） | 実装/デバッグ容易 |
| 永続化 | SQLite（WAL） | ゲスト識別、成績、直近対戦履歴 |
| デーモン | systemd | 自動起動、ログ、再起動 |
| TLS | Caddy または nginx + Let's Encrypt | DDNS + ポート開放で WSS 公開 |
| テスト | Vitest、Playwright、統合WSテスト | ルールと実画面/通信の両方を検証 |

GitHub Pages の例: `https://<owner>.github.io/<repo>/`。ゲーム API の例: `wss://<ddns-host>/ws`。DDNS名や認証情報をリポジトリに埋め込まず、Vite の `VITE_WS_URL` をビルド時に設定する。GitHub Pages のサブパスを `base` に設定し、URL 招待は `/?room=CODE`（サブパス配下）または hash routing を用いる。`window.location` に基づき招待リンクを生成。

### 2.2 通信の責務

- **操作入力/アニメーション：クライアントで即時処理。** 別フレーム更新でネットワーク待ちをしない。
- **ゲームルール：共有パッケージ**で決定論的に計算。サーバーはシード・入力順序・状態ハッシュ・攻撃を検証する。
- **サーバーが権威を持つ項目：** 試合開始時刻、ゲーム用シード、参加権限、ホスト権限、攻撃の送受、ターゲット、KO、勝者、統計。
- クライアント側の宣言した攻撃力/勝敗/統計を無条件で信用しない。
- 将来的な低遅延最適化を妨げないよう、ゲームルールとネットワークを分離。

### 2.3 リポジトリ構成

```text
/
├── apps/
│   ├── web/                     # Vite + React / GitHub Pages
│   │   └── src/{pages,components,game,canvas,input,network,settings}/
│   └── server/                  # WebSocket server / Raspberry Pi
│       └── src/{rooms,matches,security,persistence,transport}/
├── packages/
│   ├── engine/                  # 完全な盤面/回転/ロック/攻撃/ガベージ処理
│   ├── protocol/                # Message schemas + runtime validation
│   ├── rulesets/                # PPT2, custom profiles, config schemas
│   └── bot/                     # CPU AI
├── config/                      # サンプル設定（秘密情報なし）
├── deploy/{systemd,caddy,nginx}/
├── docs/{protocol,rules,operation,verification}/
├── tests/{integration,e2e,fixtures}/
├── .github/workflows/          # CI, GitHub Pages deploy
├── pnpm-workspace.yaml
└── README.md
```

## 3. コアゲーム仕様

### 3.1 盤面とミノ

| 項目 | デフォルト | 設定可否 |
|---|---|---|
| 幅 | 10列 | 部屋設定可（5〜20） |
| 表示高さ | 20行 | 部屋設定可（16〜30） |
| 隠し行 | 20行（内部計40） | 盤面整合性が保てる範囲で変更可 |
| NEXT 表示数 | 5 | 1〜10、**参加人数で減少しない** |
| HOLD | 有効、配置1回につきHOLD1回 | 有効/無効 |
| ゴースト | 有効 | クライアント表示設定（部屋主強制も可） |
| ミノ列 | I, O, T, S, Z, J, L | 固定 |
| 生成順 | 7-bag / seed付きPRNG | 将来別方式追加可能 |
| 回転 | SRS 90° 左右、個別の I キック、O 仕様 | 固定（180°は別オプション・初期無効） |
| リセット | 新ラウンドごとに盤面/HOLD/B2B/REN/キューを初期化 | 固定 |

ミノ色の初期値はガイドライン系・ぷよテト系に合わせ **I=シアン、O=黄、T=紫、S=緑、Z=赤、J=青、L=橙**。色覚多様性向けの輪郭・模様・カラーパレットを個人設定として用意する。画像・ロゴ・音源を公式作品からコピーしない。

エンジンは `step(state, input, config): {state, events}` に代表される**純粋な決定論的 API**にする。時間は固定 tick、PRNG は明示 seed。`Date.now()` や `Math.random()` をエンジン内部に使わない。

### 3.2 SRS / 回転と T-Spin

- T/J/L/S/Z に同じ標準 SRS キックテーブル、I に I 専用テーブル、O に通常の固定回転中心を適用する。
- 4つの向きと各遷移（0→R、R→2、2→L、L→0 および逆向き）を全てテストする。
- T-Spin は最終成功アクションが T 回転であること・3コーナー判定・Mini判定（前方コーナー/キック例外）を条件として検出。回転後の移動・ドロップ等が判定に与える影響をイベント記録から扱う。
- S/Z/J/L/I/O でも回転自体は当然可能。**All-Spin検知表示は任意**だが初期火力は通常ライン消去と同じ（追加スピンボーナス0）。All-Spin検出を理由に B2B を継続させない。
- T-Spin Mini の B2B 扱い、0ラインT-Spin、T-Spin Mini Doubleなど境界事例は原作挙動の検証 fixture を作る（第13章）。根拠なく断定しない。
- 180°回転を追加する場合は **標準SRSに180°規則は存在しない**ので、個別カスタムルールと明示する。

### 3.3 落下と操作

- 固定 60 tick/s の論理更新。モニターの描画 FPS とは独立。視覚描画は `requestAnimationFrame` で補間。
- 重力・ソフトドロップ倍率・ロックディレイ・ロックリセット回数・出現ディレイ・ライン消去ディレイ・DAS/ARRを定義する。
- 操作感はぷよテト寄りを目標とするが、**未実測の時間定数を「ぷよテト公式値」と呼ばない**。最初はテスト可能な `PROJECT_DEFAULT`（例: DAS=150ms, ARR=30ms, lockDelay=500ms、ただし要チューニング）として定義。DAS=0・ARR=0 による即端移動も正しく処理。
- 左右同時押し時の優先順位、先行入力、回転先行入力、接地中移動、入力リピート、フォーカス喪失、ポーズ挙動を仕様化して統合テストする。
- 接地・ロック・ライン消去・ガベージ挿入・トップアウトは確定した**同一順序**で処理する。

## 4. 火力: ぷよテト2（テトリス同士）準拠

**注意：** 以下は「テトリス対テトリス」。ぷよ vs テト異種対戦で用いる変換・ATKゲージを混ぜない。下のベース値を初期値とし、全ての攻撃値を部屋主が変更できる（ただし無効値は拒否）。

### 4.1 基本火力

| 判定 | デフォルト攻撃ライン |
|---|---:|
| Single | 0 |
| Double | 1 |
| Triple | 2 |
| Tetris (4 Lines) | 4 |
| T-Spin Mini（無ライン） | 0 |
| T-Spin Single | 2 |
| T-Spin Double | 4 |
| T-Spin Triple | 6 |
| Perfect Clear | **10（ベース攻撃に加算ではなく、最終の基礎攻撃値を10に置換）** |
| B2B | 継続が成立する時 +1 |
| S/Z/J/L等の非Tスピン | 該当ライン数の通常攻撃。スピン由来の追加0 |

- Tetris と T-Spin 系の条件で B2B が継続する（通常の Single/Double/Triple は切る。ライン消去なしの配置は原則維持）。
- **B2B ボーナスはチェーンの2回目以降**。初回の Tetris/T-Spin には +1 を与えない。
- Perfect Clear は 10 ライン固定という意味で、通常の基本攻撃と合算しない。**RENを加算するか、B2Bを適用するかの原作細部は検証 fixture で確定する**。初期実装は 10 を最終基本値として、REN・B2Bの重複加算を避ける保守的ルールで始め、検証後に `perfectClearPolicy` として確定させる。
- Mini T-Spin Single / Mini T-Spin Double / T-Spin 0 ラインなどは、検出できるイベント種別として保持し、原作の実挙動を確認できるまで通常系と混同しない。

### 4.2 REN 追加火力（ぷよテト2プロファイル）

REN の数え方は **連続でライン消去した配置の「2回目」を 1 REN** とする。内部の連続消去回数 `streak` は 1 起点、`ren = streak - 1`。これにより資料で生じる 0 起点/1 起点のずれをなくす。以下の `ren` は**画面表示に用いる 0 起点**とする。

| 表示REN | 追加火力 |
|---:|---:|
| 0〜1 | 0 |
| 2〜3 | 1 |
| 4〜5 | 2 |
| 6〜7 | 3 |
| 8〜12 | 4 |
| 13以上 | 5 |

この表は Puyo Puyo Tetris 2 に関する複数のコミュニティ資料で一致する系列を採用する。ただし別資料には**同じ数値を「何回目の連続消し」かで表示したものがあり、REN番号が1ずれる例がある**。必ず具体的な連続消去入力テストと原作実機の照合を実施する。

### 4.3 設定データと計算順序

```ts
interface AttackRules {
  single: number;
  double: number;
  triple: number;
  tetris: number;
  tSpinZero: number;
  tSpinMiniZero: number;
  tSpinMiniSingle: number;
  tSpinMiniDouble: number;
  tSpinSingle: number;
  tSpinDouble: number;
  tSpinTriple: number;
  perfectClear: number;
  perfectClearPolicy: 'replace-base' | 'add-to-base';
  b2bBonus: number;
  renBonus: number[]; // 最終要素以降を上限値として再使用
  enableNonTSpinBonus: boolean; // default false
  nonTSpinBonuses: Record<string, number>; // default all 0
}
```

`piece lock → clearCount/spinType/PC確定 → B2B/REN状態更新 → 基本攻撃算出 → PC規則適用 → B2B・REN付与 → 受信待ちおじゃま相殺 → 正味攻撃の分配・送信`。**PC、B2B、RENの重複適用条件は単体テストと原作検証で確定**。入力の変更ではなくルール変更でイベントログ/リプレイが変わるため、ルールバージョンを試合データに保存する。

## 5. おじゃま（Garbage）仕様

部屋主は `garbageStyle = 'ppt2' | 'tetrio'` を選択できる。**攻撃火力テーブルの選択とは独立**：`ppt2Attack` + `tetrioGarbage` の組合せも可能。原作固有の「火力」まで TETR.IO に置き換えるわけではない。

共通：おじゃまは 10 列なら各行1つの穴を持つ灰色の行。幅変更時も各行1穴。受信は `GarbagePacket{id,sourceId,targetId,lines,createdTick,arrivalTick,holes[],status}` として扱い、表示・相殺・挿入を分離。送り手と受け手で乱数/穴の列を予測不能にしつつサーバーで再現可能にする。

### 5.1 ぷよテト式（初期デフォルト）

- 受信攻撃を予告ゲージに積む。攻撃発生時、相手への送信より先に受信予告を古い順に相殺する。
- ライン消去した配置の直後はおじゃまを上げない。**ライン消去なしでミノが固定された際、受信予定おじゃまを下からせり上げる**（適用数は1回上限を設定可能）。
- 穴位置は各攻撃パケットで規則的に構成し、無関係な毎行乱数変更を避ける。攻撃パケット境界と複合攻撃時の穴の扱いは実機検証用 fixture を作る。
- 他の攻撃パケット同士のキャンセル順、ガベージ上昇とトップアウト判定の順序をテストで固定。
- 原作再現に必要なミノ固定後の遅延値や一度のせり上がり上限などの確証がない値は `PROJECT_DEFAULT` と明記し調整可能にする。

### 5.2 TETR.IO式（選択可能）

- **TETR.IO のネットワーク受信キューや時間遅延とガベージ上昇条件を参照**し、独立した `GarbagePolicy` を実装する。受信パケットの pending/active 状態、到着遅延、挿入上限、hole-change（messiness）を設定可能にする。
- 初期 TETR.IO 風プロファイルは、到着までの待機時間・到着後の有効化・ライン消去による延期/相殺・ミノ固定時の挿入をそれぞれ独立した遷移として持つ。
- `garbageTravelTicks`, `garbageActivationTicks`, `garbageCapPerLock`, `messiness`, `blockingMode`, `passthrough`（初期無効）を用意。**ゲームモード/バージョンで挙動が異なるため、TETR.IOの特定バージョンに固定した実測表を後から採用可能**にする。
- `garbageStyle` 切替だけで attack, spin 判定, input 等に影響が出ないこと。

## 6. 対戦方式とターゲット

### 6.1 モード

- `ffa`: 全員が敵。勝者は最後の1人。
- `team`: 同じチームへの攻撃禁止。勝者は最後の生存チーム。
- 2〜10名（人間プレイヤー）の参加枠。チーム戦は**最大4チーム、各チーム0〜6人、チーム人数差を許容**。空チームはロビー表示できるが実際の対戦候補には含めない。
- チーム総人数が10人以下、参加者1人につきちょうど1チーム所属。開始時、非空チーム数は2〜4。

### 6.2 攻撃対象方式（部屋設定）

| モード | 挙動 |
|---|---|
| `manual` | 試合中、敵個人をマウス/キー/パッドで選択。KO済なら再選択 |
| `random` | 生存敵からサーバーPRNGでランダム選択。指定周期またはKO時に更新 |
| `all_equal` | 正味攻撃ラインを敵全体へ**総量保存で**均等割当。端数はシード付き循環配分 |
| `attackers` | 自分に攻撃している生存敵から選択（テト99風） |
| `badges_like` | KO/直近成績等でスコア化した相手へ自動照準（テト99風の近似、**公式のバッジ仕様をそのまま実装したとは主張しない**） |
| `danger` | 盤面危険度の高い生存敵を選択（テト99風） |

- `all_equal` は 5ライン攻撃/3人を 2,2,1 のように**合計5**にする。各人へ5ずつ複製しない。
- `manual`, `random` 等は正味攻撃を1人へ送る。特別な重複・マルチターゲット倍率はない。
- サーバーは敵候補を `alive && notSameTeam && notSelf` でフィルタする。敵が0なら攻撃は失効。すべての選択方式で敵味方区別を守る。
- デフォルトは FFA/チームとも `manual`、UIから個人選択。部屋主が方式を試合前に指定し、ロビーで全員に通知。
- チーム単位に一度均等分配してから各チーム内で分配する `team_equal` も拡張オプションとして用意可。**チーム人数の偏りで総火力が増減しない**ようにする。

## 7. 部屋・招待・リーダー移譲

### 7.1 参加

- ゲスト名を入力し「部屋を作る」または「部屋へ参加する」を選択。
- 推測しにくい **8〜10文字のランダム部屋コード**（紛らわしい文字除外、十分なエントロピー・レート制限）。例は `8F3KQ7MZ`。
- 招待 URL: `https://<owner>.github.io/<repo>/?room=8F3KQ7MZ`。開くと参加確認・名前入力→接続。招待URLは接続情報ではなく部屋識別子。
- 必要ならルームパスワード、参加締切、観戦可否、キック、人数上限（2〜10）を設定。部屋コード/招待リンクはコピー可能。
- 部屋主が開始ボタンを押して**現在参加している有効な2人以上**で開始（全員READYを必要とするかはルームオプション、デフォルト不要）。待ちカウントダウン3秒。開始時のルール・所属チーム・seedを凍結。

### 7.2 ロビーと権限

部屋主だけがルール設定、プレイヤーキック、手動チーム振分け、オートバランス、開始、リーダー指名を実行できる。各操作の要求者をサーバーで認可。一般参加者は自分の名前・チーム・READY状態・入力設定を変更可。試合中のルール設定変更は次試合から適用（現試合のスナップショットは不変）。

### 7.3 部屋主が退出/切断したとき

- `transferLeader(targetPlayerId)`：部屋主がオンラインの他プレイヤーに明示的移譲可能。
- 自然退出時：最古の接続中参加者に自動移譲。同時刻ならサーバー発行IDで安定タイブレーク。
- 瞬断時：**30秒の復帰猶予**を設ける。猶予中は副リーダーを設定できる（任意）、部屋主の権限を奪わない。猶予超過で自動移譲。
- 移譲先が不在になったら次候補へ。残存者0でルーム破棄（短い猶予も設定可）。
- 試合中は試合を中断せず進行し、移譲によりルールが変わることもない。
- IDは認証なしでもブラウザ内ローカルな `guestId` と再接続用**ランダム秘密トークン**で識別。`guestId` だけでのなりすましを許さない。秘密トークンはURLやチャットに載せない。切断復帰は元プレイヤー枠へ戻す。

## 8. チーム戦とオートバランス

### 8.1 ロビーUI

- 1〜4チームを作成・削除できる。チーム名・色・参加者一覧を表示。
- 各チームの上限は6人。0人チームも許容。
- ドラッグ&ドロップ、ボタン、パッド対応の移動操作。チーム別人数/平均スキルを表示。
- 部屋主が `自動バランス` を押すとプレビュー表示→確定。勝手に試合開始/人数再配分しない。

### 8.2 スキル推定

プレイヤーの**直近有効な対戦**（例: 直近20試合または90日、少ない方ではなく取得可能な範囲）から、少なくとも次を収集する：

- `PPS`（pieces per second: 置いたミノ数/稼働秒数）
- `APM`（attacks per minute: **相殺前の生成火力**/分）
- `APP`（attacks per piece: 生成火力/配置数）
- `survivalSeconds`, `winRate`, `matchesPlayed`（信頼度指標）

互換性のない独自火力ルールの成績は正規化するか統計プールから外す。標準ルールでの APM と PPS を同じ尺度で評価。最初の実装は `skill = 0.35*z(PPS) + 0.45*z(APM) + 0.20*z(APP)`（**プロジェクト初期仮定であり実証済みの最良配分ではない**）を用い、各指標は直近データのロバストな正規化/上限クリップ。対戦数が少ない人は母集団平均へ縮約し、過信しない。戦績未取得のゲストは暫定スキルと低信頼度表示。CPUは難易度別の目安スキルとして扱えるが、初期の対人オートバランスには混ぜない。

### 8.3 最適化

- 与えられた全プレイヤーを、最大4つの非空チーム（空チームはそのまま残してよい）に割り当てる。各チーム0〜6人、総員2〜10人。
- **人数差を制約で禁止しない。** 合計チームスキルを揃えるために 6対4、5対3対2 等を許容。
- 目的関数の例：`sum_t (sumSkill[t] - meanSumSkill)^2 + λ*sum_t uncertainty[t]^2 + μ*penaltyForExtremeHeadcount`。人数ペナルティは低く、ユーザーが0に設定可。
- 10人・4チームなら全組合せの枝刈り探索・ビームサーチ・局所探索等で十分。制約を満たす割当を複数候補表示。
- 表示にはスキル推定値・信頼度・期待バランス指標を示す。**真の勝率や公平性を保証する値ではない**。
- 再計算しても固定seedでは同じ結果。プレイヤー追加・除外時は再計算を提案するが自動強制しない。

## 9. キーボード / ゲームパッド

### 9.1 入力機能

左/右、ソフトドロップ、ハードドロップ、右90°、左90°、HOLD、（追加ルール有効時のみ）180°、ターゲット前/次、ポーズ/メニューを全て割当可能にする。

- `keyboard` と `gamepad` の**独立したキーバインドプロファイル**。複数ゲームパッドから選択。
- ゲームパッドは Gamepad API で監視し、ボタン/十字キー/スティック（デッドゾーン/反復）を割当可能にする。切断復帰・フォーカス喪失時はキーを押しっぱなしにしない。
- ブラウザの予約ショートカットと衝突するキーは警告し、再設定を促す。
- デフォルトは「ぷよテト風」配列とし、**OS/プラットフォームごとに公式の既定キーが異なる可能性**を考慮。以下は検証まで `PROJECT_DEFAULT` と呼ぶ。実際のぷよテトPC/ゲーム機操作と照合して `docs/verification/controls.md` に記録。

| 操作 | キーボード初期案（プロジェクト既定） | ゲームパッド初期案（Xbox表記） |
|---|---|---|
| 左右 | ← / → | D-pad 左右 |
| ソフトドロップ | ↓ | D-pad 下 |
| ハードドロップ | ↑ | D-pad 上 |
| 時計回り | X | B |
| 反時計回り | Z | A |
| HOLD | C | LB |
| ターゲット切替 | Q / E | LT / RT |
| メニュー | Escape | Menu/Start |

**部屋主による DAS/ARR 規制**：`inputPolicy = 'free' | 'restricted' | 'locked'`。
- `free`: プレイヤーがローカルに変更可能。
- `restricted`: 部屋主指定の min/max の範囲に制限。
- `locked`: 部屋指定値に強制固定。UIに鍵アイコンと値を表示。
- DAS/ARRの単位は ms、内部では tick へ変換。試合途中の変更禁止/次試合反映。**入力物理デバイス固有の遅延を厳密には統制できない**ため、ネットワークイベントタイミングや実行状態の異常を検証。
- `localStorage` にゲームパッド/キーボード別設定と音量/描画/配色を保存。

## 10. 画面設計

1. ホーム：ソロ3モード、部屋を作る、コードで入る、設定。
2. ローカルゲーム：中央に大きい自盤面、HOLD左、NEXT右、タイム/スコア/速度/ライン。
3. ロビー：招待URL/コードコピー、参加者一覧、チーム分け、オートバランス、ルール設定、ホスト権限移譲、開始。
4. 対戦：**自盤面は常に最大の表示領域**、他プレイヤー2〜9人のフィールドを右側/周囲へ縮小配置。10人の場合はカード型グリッド（例3×3）を検討し、自盤面は縮めない。小盤面でも現状・KO・攻撃元・ターゲット・チーム色を識別可能にする。
5. 結果：順位、チーム順位、KO、PPS/APM/APP、送信量・相殺量、プレイ時間、再戦。
6. 設定：入力/画質/色/音/アクセシビリティ。

レスポンシブ対応。**スマートフォンは観戦やロビー閲覧を優先**、タッチ対戦は追加要件（初期で品質保証しない）。ゲームパッドはブラウザ接続後に操作で認識し、接続状態を表示。Canvas の盤面座標系と CSS の拡縮を分離。プレイ中のスクロール/テキスト選択/意図しないブラウザ操作を抑制。音の自動再生制限に対応。

## 11. WebSocket プロトコル

### 11.1 接続とシーケンス

```text
Client -> Server: hello {protocolVersion, resumeToken?, clientBuild}
Server -> Client: welcome {sessionId, resumeToken, serverTime, limits}
Client -> Server: room.create {name, settings}
Server -> Client: room.snapshot {room, players, hostId, revision}
Client -> Server: room.join {code, displayName}
Client -> Server: room.updateSettings {expectedRevision, patch} [host only]
Client -> Server: room.transferHost {targetId} [host only]
Client -> Server: team.assign / team.autobalance.preview / team.autobalance.apply
Client -> Server: room.start [host only]
Server -> All: match.prepare {matchId, seedCommitment, rulesSnapshot, startAt}
Server -> All: match.start {startTick, playerSeeds, initialStates}
Client -> Server: input.batch {matchId, startTick, seq, actions[]}
Client -> Server: state.checksum {tick, hash}
Server -> Client: state.resync {tick, authoritativeSnapshot, inputsSince}
Server -> All: match.event {tick, kind, payload}
Server -> All: match.end {reason, placement, teams, statistics}
Server -> All: room.snapshot {status: 'lobby', ...}
```

イベントスキーマは `packages/protocol` 内で TypeScript 型と runtime validation（Zod等）を共有し、未知キー・サイズ過大・整数範囲外・権限不足を拒否。すべての操作に requestId と応答/エラー。個人情報や秘密トークンをログへ出さない。

### 11.2 同期モデル

1. 60Hz 論理 tick。開始時刻をサーバー同期し、クライアント側は入力をすぐ局所反映。
2. **状態権威サーバー + 入力予測**を基本とする。サーバーは入力を順序付きで再演算し、最終配置・攻撃・KOを判定。
3. クライアントは周期的な状態チェックサムとサーバーからの盤面差分/スナップショットで誤差を検出。誤差時はリコンシリエーション。テレポート的な表示は最小化。
4. 入力 `seq` / `tick` でリプレイ攻撃防止、遅延/未来入力に上限。ネット遅延に合わせる `inputDelayTicks` は部屋設定可能（初期は小さく）。
5. サーバーは10人×60 tickを処理できるようベンチマークを作る。相手盤面は毎tick全転送せず**配置/攻撃イベント＋10〜20Hz状態スナップショット**で補完。描画は60fps。
6. サーバー→クライアント送信は認証済みゲーム状態のみ。観戦者には公開可能な情報だけ送る。対戦者以外へ未来 NEXT / PRNG seedを漏らさない（必要ならコミットメント→後開示）。
7. **共有エンジンを使ってもブラウザは改造できる**。サーバーで原則再演算し、クライアント自身の攻撃やライン消去の申告を権威として扱わない。
8. パケット遅延/断線：再接続後 `matchId + tick` からスナップショット・必要なリプレイを取得。未接続中のプレイヤーはロックして入力停止/重力継続（ロビー設定の切断方針による）し、永久停止しない。

### 11.3 通信量と安全性

WebSocket Origin の許可リストを設定（Pages URL とローカル開発のみ）。`wss://` 必須。IP/セッション単位の接続数/メッセージ頻度制限、ルーム参加試行回数制限、フレームサイズ上限、Heartbeat、ロードシェディングを設ける。部屋コードは認証ではないので、秘密部屋の保護には別のパスワード/招待トークンを使う。ページ上にサーバー管理者 API や秘密鍵を露出しない。

## 12. Raspberry Pi / DDNS / GitHub Pages の配備

```text
Browser
  | HTTPS   https://owner.github.io/repo/
  v
GitHub Pages [static files]
  |
  | WSS   wss://your-ddns.example/ws  (TCP 443)
  v
Router :443 -> Raspberry Pi :443
  v
Caddy / nginx (TLS)
  v
Node.js WS server at 127.0.0.1:3001
  v
SQLite + room/match engine
```

- DDNS更新はルーターまたは Raspberry Pi の `ddclient` 等で行う。DDNS A/AAAA の整合性、二重 NAT、CGNAT、IPv6 ファイアウォールの存在を検証。CGNAT 下で IPv4 ポート開放が不可なら、ISP にグローバルIPv4/IPv6到達可能性を確認し、構成を見直す。
- TCP 443 を外部公開。Node.js の 3001 は外部公開禁止（loopback のみ）。HTTP 80 は ACME/HTTPS リダイレクト用途に必要に応じて開放。TLSはCaddyの自動証明書推奨。
- systemd サービスに `Restart=on-failure`, `User=nonroot`, `WorkingDirectory`, `EnvironmentFile`, 適切なファイル権限を設定。端末/SSHセッションに依存させない。
- SQLite は専用データディレクトリに置き、バックアップは暗号化可能な別保存先へ。バックアップと復元の演習。
- README にルーター設定手順、DDNS確認コマンド、TLS検証、systemd 操作、ログ確認、デプロイ/更新/ロールバックを掲載。
- `VITE_WS_URL` は公開可能な URL のみを格納。DB秘密情報等を `VITE_` 環境変数に置かない。
- ブラウザで開くGitHub PagesがHTTPSなので `ws://` への Mixed Content を許容しない。
- API/ゲームサーバーは Docker を必須としない。Raspberry Pi OS 向けに systemd 素運用手順を最初に提供。任意で Docker Compose も追加できる。

## 13. テスト・受け入れ条件

### 13.1 ゲームエンジン

- SRS全ミノ・全回転・壁/床キック、I と他ミノの差、回転失敗。
- 7-bagは各7連続で7種類1個ずつ、seed一致時に完全再現。
- HOLD 1回制限、NEXTが5から減らない、ミノ固定/ライン消去/スピン/パフェ/トップアウト。
- TSD=4, TST=6, Tetris=4, Single=0, PC=10（標準プロファイル）。任意ルール編集時にも値通り計算。
- B2B継続、B2B破壊、REN表示と内部カウンターのズレ、REN 0〜15の連続消去 fixture。
- 相殺時に入力攻撃量が減り、**誰にも攻撃を二重送信しない**。
- garbageStyle を変更しても基本火力は変化しない。
- 自動攻撃分配で対象全員への合計が正味攻撃に一致する。

### 13.2 ロビー/チーム

- 2人で試合開始でき、10人でも開始でき、11人目は拒否される。
- NEXT数は2〜10人で固定。
- 6人チーム可、7人チーム不可、4チーム可、5チーム不可、0人チーム可（開始時は非空2チーム以上）。
- ホストのみ開始/設定/キックでき、退出時は権限が移り、手動移譲も可能。
- 参加URL/コードの両方が同じ部屋に入る。
- オートバランスは全員を漏れ/重複なく割り当て、人数差を許可し、同一seedで同じ割当になる。
- 同チームへの攻撃が起きず、味方のKOが勝利条件にならない。

### 13.3 E2E/非機能

- 2ブラウザからリモート対戦・招待リンク・再戦ができる。
- 模擬ネットワーク条件（RTT 30/100/200ms、ジッター、パケット欠落、切断復帰）で対戦が維持される。
- 10人部屋でCPU・メモリ・送受信帯域を測定し、Raspberry Pi 実機上で快適さを検証。測定前に保証数値を捏造しない。
- Chrome/Edge/Firefoxのキーボード、対応ブラウザのGamepad APIで動作確認。
- ワイド画面で自盤面大・他9盤面小のUI、ウィンドウ縮小時のレイアウト崩れなし。
- HTTPS Pages → WSS DDNS、Origin 制限、失効トークン拒否、ルーム操作認可が成立。

### 13.4 原作再現の検証バックログ（**未確定事項**）

以下は調べた資料だけでは十分な確証を持たない。実装に取り込む前に原作のバージョン/プラットフォーム・映像または実機結果・参照URL・テストを `docs/verification/` に保存する。

1. ぷよテト2のT-Spin Mini、0-line spin、Mini Double、B2BとPerfect Clearの厳密な例外。
2. ぷよテト2でPerfect ClearとREN/B2Bが同時発生した際の加算/置換順序。
3. ぷよテト2のガベージ穴変更・パケット合成・一度に上がる最大行数・適用tick。
4. ぷよテト2の初期DAS/ARR/ロックディレイ/入力先行受付、およびPC/Switch等の正式なデフォルトキーバインド。
5. TETR.IOのどのモード・バージョンのgarbage仕様に合わせるか。既定の travel / activation / cap / messiness などの実測。

**確認が取れるまで `PROJECT_DEFAULT` を採用し、未検証部分を「原作完全再現」と呼ばない。**

## 14. AI実装手順（順番厳守）

### Phase 1: 基礎

モノレポ作成、TypeScript、Vite、静的PagesのCI、ルールスキーマ、盤面/7-bag/HOLD/SRS/ライン消去の共有エンジンとテスト。**完了条件：** ブラウザで落ち物パズルが動き、同じシード/入力で同じ結果。

### Phase 2: ソロ

マラソン150ライン、40 LINES、スコア/時間/自己ベスト保存、キーボード/ゲームパッド設定、DAS/ARR、描画と音。**完了条件：** 3回以上の連続プレイでゲーム終了・再試行・設定保存が正常。

### Phase 3: 火力・CPU

T-Spin判定、B2B、REN、PC、攻撃カスタム、ガベージ2方式、CPU AI（合法手列挙+盤面評価+探索深度で難易度調整）。CPUは設定に従う入力/配置を行い、デバッグ用に先読みと演算予算を表示できる。**完了条件：** CPU対戦が可能、火力fixture合格。

### Phase 4: オンライン部屋

WS接続、部屋コード/URL、ロビー、ホスト移譲、開始/再戦、ゲーム状態同期、リコネクト。**完了条件：** 別PC/ブラウザから2人対戦し、切断復帰できる。

### Phase 5: 10人・チーム

ターゲット方式、2〜10人盤面表示、最大4チーム、手動振分け、オートバランス、集計。**完了条件：** 10人FFA、人数差のあるチーム戦、退出時移譲、戦績に応じた分配が動作。

### Phase 6: 実運用

Raspberry Pi systemd、DDNS、TLS、セキュリティ、SQLite、負荷・E2Eテスト、ドキュメント、リプレイ/ログ、運用監視。**完了条件：** GitHub PagesからDDNSのWSSへ接続して一連の対戦が実行可能。

各Phaseでコード、テスト結果、README、残課題と未検証値の一覧をコミット単位で提示する。**動く最小単位を優先**し、先に全画面だけをハリボテで作ってゲームルールを後回しにしない。

## 15. データモデルの例

```ts
type MatchMode = 'ffa' | 'team';
type GarbageStyle = 'ppt2' | 'tetrio';
type TargetMode = 'manual' | 'random' | 'all_equal' | 'attackers' | 'danger' | 'badges_like';

interface RoomSettings {
  maxPlayers: number;             // 2..10
  mode: MatchMode;
  teamCount: number;              // team時 2..4
  maxPlayersPerTeam: number;      // default 6
  fieldWidth: number;             // default 10
  visibleHeight: number;          // default 20
  hiddenHeight: number;           // default 20
  nextCount: number;              // default 5, 人数で減らさない
  garbageStyle: GarbageStyle;
  targeting: TargetMode;
  attackProfile: 'ppt2' | 'custom';
  attackRules: AttackRules;
  inputPolicy: 'free' | 'restricted' | 'locked';
  dasMs: number;                  // project default: 150
  arrMs: number;                  // project default: 30
  dasBounds?: [number, number];
  arrBounds?: [number, number];
  requireReady: boolean;          // default false
  allowSpectators: boolean;
  allowLateJoinAsSpectator: boolean;
  ruleVersion: string;
}

interface PlayerStatistics {
  placements: number;
  elapsedActiveSeconds: number;
  attackGenerated: number;
  attackSent: number;
  attackCancelled: number;
  receivedGarbage: number;
  linesCleared: number;
  knockouts: number;
  pps: number;
  apm: number;
  app: number;
}

interface Room {
  code: string;
  hostId: string;
  revision: number;
  status: 'lobby' | 'countdown' | 'playing' | 'results';
  settings: RoomSettings;
  members: PlayerSummary[];
  createdAt: number;
}
```

エンジン/部屋/プロトコルで shared DTO と private model を分ける。データ構造変更時はプロトコルバージョンとマイグレーションを追加。

## 16. 参考資料・扱い方

- SEGA『ぷよぷよテトリス2』公式ルール（マラソン150ライン、VS等）: https://puyo.sega.jp/puyopuyotetris2/rule.html
- SEGA『ぷよぷよテトリス2S』公式WEBマニュアル（HOLD、T-Spin、B2B等）: https://manual.sega.jp/puyopuyotetris2/S/jp/
- TetrisWiki — Puyo Puyo Tetris（テトリス同士火力/異種戦差異）: https://tetris.wiki/Puyo_Puyo_Tetris
- 対戦テトリスにおける火力表（PPT2/REN差異）: https://shiwehi.sakura.ne.jp/tetris/template/karyoku.php
- How to Tetris — Combos（PPT2 REN系列）: https://howtotetris.com/combos/
- テトリス攻略wiki（ぷよテト2火力/PC）: https://w.atwiki.jp/tetrislide/pages/34.html
- テトリスのかけら — 攻撃と相殺（せり上がりの参考）: https://w.atwiki.jp/tetriskakera/pages/24.html
- TETR.IO wiki — Mechanics: https://tetrio.wiki.gg/wiki/Gravity
- TETR.IO wiki — QUICK PLAY: https://tetrio.wiki.gg/wiki/QUICK_PLAY

**注意：** 非公式Wikiは参考情報であり公式による保証ではない。ぷよテト2/テト99/TETR.IOの仕様を取り違えない。タイトル・ロゴ・音楽・キャラデザイン・ゲーム独自アセットをコピーしない独自デザインとする。

---

### コーディングAIへ渡す冒頭プロンプト（任意）

> 添付の `tetris_multiplayer_design.md` を唯一のプロジェクト要求仕様として扱い、Phase 1 から実装してください。TypeScriptモノレポで共有ゲームエンジンを先に完成させ、Vitestの単体テストを添えてください。原作の未検証値は必ず `PROJECT_DEFAULT` と明記し、推測を原作仕様と断言しないでください。各フェーズで実行手順と成功条件を満たしたことを示し、必要な設定値・未解決項目を文書化してください。実装・テスト可能な状態を継続し、空のUIだけで終わらせないでください。
