# STACKLANE

Raspberry Pi 上の Node.js 対戦サーバーと、GitHub Pages 用のブラウザクライアントからなる落ち物パズル。独自のデザイン・音を使用しています。

設計仕様: [docs/design.md](docs/design.md)。参照作品の完全再現は主張しません。未実測値は `PROJECT_DEFAULT` です。

## 開発

Node.js 24.12 以降と pnpm 12.8.1 を使用します。

```sh
npm install -g pnpm@12.8.1
pnpm install
pnpm run dev:web
```

http://127.0.0.1:5173/ を開きます。マラソン150ライン・40 LINESでプレイできます。

```sh
pnpm run typecheck
pnpm run test
pnpm exec playwright install chromium
pnpm run test:e2e
```

初期キーボード操作: ←/→ 移動、↓ ソフトドロップ、↑ ハードドロップ、Z/X 回転、C HOLD、Escape メニュー。

## 実装・検証状況

[検証記録](docs/verification/progress.md) に段階ごとの結果と未確認事項を記載します。ラズパイ実機、インターネット経由 WSS、実物ゲームパッドでの検証は別途必要です。
