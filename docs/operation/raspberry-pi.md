# Raspberry Piへの配備

フロントは [GitHub Pages](https://iorin-elmo.github.io/tetris/)、対戦サーバーは `tetris.server-on.net` で運用します。以下はラズパイ側で実行します。機種ごとの性能は実機測定後に確認してください。

## 1. 前提

64-bit Raspberry Pi OS、Node.js 24.12以降、pnpm 12.8.1、Git、Python 3、Caddyを準備します。Nodeはsystemdから使える `/usr/local/bin` または `/usr/bin` に置きます。ホーム内だけのNodeはProtectHome設定で利用できません。[Node公式配布](https://nodejs.org/en/download) と [Caddy公式導入](https://caddyserver.com/docs/install) を参照。

別アプリが既存のNodeを使用している場合は、テトリス専用のNode 24を `/opt/stacklane-runtime/node-v24.12.0-linux-arm64/` などに配置できます。その場合は `/etc/systemd/system/stacklane.service.d/runtime.conf` で `[Service]` の `Environment=PATH=/opt/stacklane-runtime/node-v24.12.0-linux-arm64/bin:/usr/local/bin:/usr/bin:/bin` を設定します。

OSでパッケージが提供されている場合の補助ツール導入例:

```sh
sudo apt update
sudo apt install git python3 sqlite3 caddy dnsutils
node --version
npm install --global pnpm@12.8.1
```

ルーターでラズパイのLAN IPを固定割当し、外部TCP 443→Pi:443、証明書/リダイレクト用TCP 80→Pi:80を転送します。3001は転送しません。CGNAT・二重NATがある場合は外部到達性を先に確認します。AAAAを公開する場合はIPv6ファイアウォールも設定します。

## 2. ソース配置

```sh
sudo useradd --system --home-dir /var/lib/stacklane --shell /usr/sbin/nologin stacklane
sudo install -d -o "$USER" -g "$(id -gn)" /opt/stacklane
git clone https://github.com/iorin-elmo/tetris.git /opt/stacklane
cd /opt/stacklane
pnpm install --frozen-lockfile
pnpm run test
pnpm run build
```

サービス用ユーザーにはソースの書き換え権限を与えず、ビルド済みJSを実行します。

## 3. systemd

```sh
sudo install -d -m 0750 /etc/stacklane
sudo install -m 0600 config/server.env.example /etc/stacklane/server.env
sudoedit /etc/stacklane/server.env
sudo install -m 0644 deploy/systemd/stacklane.service /etc/systemd/system/stacklane.service
sudo systemctl daemon-reload
sudo systemctl enable --now stacklane
sudo systemctl status stacklane --no-pager
curl --fail http://127.0.0.1:3001/health
```

本番設定はHOST=`127.0.0.1`、PORT=`3001`、DATABASE_PATH=`/var/lib/stacklane/stacklane.sqlite`、ALLOWED_ORIGINS=`https://iorin-elmo.github.io`、TRUST_PROXY=`true`です。Originに `/tetris/` は付けません。loopbackのCaddy/nginxのみをプロキシとして信頼します。StateDirectoryがDB用ディレクトリを作ります。

```sh
sudo journalctl -u stacklane -f
sudo systemctl restart stacklane
sudo systemctl stop stacklane
sudo systemctl start stacklane
```

## 4. MyDNS

MyDNSのDOMAIN INFOで `tetris.server-on.net` のAレコードを設定します。ID・パスワードはGitHubやフロントに入れず、Pi上の環境ファイルだけに保存します。

```sh
sudo install -m 0600 deploy/mydns/mydns.env.example /etc/stacklane/mydns.env
sudoedit /etc/stacklane/mydns.env
sudo install -m 0644 deploy/systemd/stacklane-ddns.service /etc/systemd/system/stacklane-ddns.service
sudo install -m 0644 deploy/systemd/stacklane-ddns.timer /etc/systemd/system/stacklane-ddns.timer
sudo systemctl daemon-reload
sudo systemctl start stacklane-ddns.service
sudo journalctl -u stacklane-ddns --no-pager
sudo systemctl enable --now stacklane-ddns.timer
sudo systemctl list-timers stacklane-ddns.timer
```

`MYDNS_ID` / `MYDNS_PASSWORD` を実際の値に置き換えます。初期設定はIPv4のみ。この処理は実行元のIPを通知するため、Piのある回線から実行してください。認証情報は引数やログに出さずHTTPSで通知します。

[MyDNS公式手順](https://www.mydns.jp/) のHTTPS Basic方式を使用し、30分ごとに通知します。成功表示の後、MyDNSのLOG INFOとDNSも照合してください。IPv6は外部到達性を確認した後、`MYDNS_FAMILY=ipv6` の別サービスで構成できます。

```sh
getent ahostsv4 tetris.server-on.net
dig +short A tetris.server-on.net
dig +short AAAA tetris.server-on.net
```

## 5. CaddyとTLS

既存Caddy設定があれば保管し、共存するよう統合してください。

```sh
sudo install -m 0644 deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy --no-pager
curl --fail https://tetris.server-on.net/health
openssl s_client -connect tetris.server-on.net:443 -servername tetris.server-on.net </dev/null
```

Caddyが証明書を取得し、WebSocket Upgradeも中継します。[公式reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) を参照。代替の [nginx設定](../../deploy/nginx/stacklane.conf) もありますが、Caddyと同時に443を使いません。

スマホ回線など外部回線から `/health` とPagesの部屋参加を確認します。HTTPSのPagesから平文 `ws://` へは接続しません。

## 6. Pages

Settings → PagesをGitHub Actionsに設定します（初回作成時に設定済み）。`main`へのpushでPagesワークフローがビルド・配信します。URLは `https://iorin-elmo.github.io/tetris/`。接続先変更時はRepository variable `VITE_WS_URL` を変更して再ビルドします。公開URL以外の秘密情報は設定しません。[GitHub公式手順](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) を参照。

## 7. バックアップと復元

オンラインバックアップAPIで、WAL稼働中も一貫したコピーを作ります。出力先は毎回新しい名前にします。

```sh
cd /opt/stacklane
sudo -u stacklane env DATABASE_PATH=/var/lib/stacklane/stacklane.sqlite \
  node scripts/backup.mjs /var/lib/stacklane/backups/stacklane-before-update.sqlite
sudo -u stacklane sqlite3 /var/lib/stacklane/backups/stacklane-before-update.sqlite 'PRAGMA integrity_check;'
```

DBとバックアップにはゲスト識別ハッシュ・戦績・対戦シードを含むため公開しません。別ディスクへの保存やage等の暗号化は運用側で設定してください。コピーをテスト用DBとして開き、integrity_checkと戦績件数を確認する復元演習を行います。

本番復元は停止後、既存DBとWAL/SHMを退避してバックアップを設置します。

```sh
sudo systemctl stop stacklane
archive_dir="/var/lib/stacklane/restore-safety/$(date +%Y%m%d-%H%M%S)"
sudo install -d -o stacklane -g stacklane -m 0700 "$archive_dir"
for name in stacklane.sqlite stacklane.sqlite-wal stacklane.sqlite-shm; do
  if sudo test -f "/var/lib/stacklane/$name"; then
    sudo mv -- "/var/lib/stacklane/$name" "$archive_dir/$name"
  fi
done
sudo install -o stacklane -g stacklane -m 0600 \
  /var/lib/stacklane/backups/stacklane-before-update.sqlite /var/lib/stacklane/stacklane.sqlite
sudo systemctl start stacklane
curl --fail http://127.0.0.1:3001/health
```

## 8. 更新・ロールバック

更新前にバックアップを取り、`git rev-parse HEAD`を記録します。部屋・試合は再起動で終了するため、参加者がいない時間に更新します。

```sh
cd /opt/stacklane
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run test
pnpm run build
sudo systemctl restart stacklane
curl --fail http://127.0.0.1:3001/health
```

失敗時は停止し、`git checkout <記録したSHA>`で戻して同じインストール・ビルド・起動を実行します。DBスキーマも戻す場合は対応するバックアップを復元してください。現在のスキーマはversion 2です。

## 9. 運用

`/health`、systemd/Caddy/DDNSログ、空き容量、DB/バックアップ容量を監視します。リプレイ入力は1秒単位で保存するため、強制停止では最後の未flush分が失われる可能性があります。古い記録の削除は保存方針とバックアップを決めてから実施してください。

```sh
pnpm run benchmark
sudo -u stacklane env DATABASE_PATH=/var/lib/stacklane/stacklane.sqlite \
  /opt/stacklane-runtime/node-v24.12.0-linux-arm64/bin/node /opt/stacklane/apps/server/dist/replay.js <match-id>
```

実機でCPU・メモリ・通信量と操作感を確認します。PCの測定をPiの保証値にはしません。

公開先の外部接続を確認する場合は、GitHub Actionsの「公開サーバー接続確認」を手動実行します。CLIでは `node scripts/public-smoke.mjs` でも確認できます。公開先に10人分のテスト接続と部屋を作成し、検証後は退出します。
