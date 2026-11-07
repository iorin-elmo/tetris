# WebSocket protocol v1

パスは `/ws`、JSON、最大16KiB、圧縮なし。受信スキーマは `packages/protocol/src/index.ts`、未知キーも拒否します。全要求にrequestIdを付け、ackまたはerrorで応答します。welcome/pong/自動バランス候補は専用応答です。

## 接続・復帰

`hello {protocolVersion:1, clientBuild, resumeToken?}` → `welcome {sessionId,resumeToken,serverTime,roomCode,limits}`。秘密トークンは32byteの乱数で、復帰時にローテーションし、DBにはSHA-256ハッシュだけを保存します。期限は24時間、部屋内切断猶予は30秒。同一トークンで接続した新ソケットが旧接続を置き換えます。

ブラウザは接続先ごとのトークンと部屋識別子をローカルに保存し、ページ再読込後も復帰します。URLには秘密を入れません。サーバー再起動後は部屋を再作成します。退出時は即時、切断時は30秒後に接続中の最古参加者へホストを移譲します。

## 部屋

| 要求                          | データ・権限                        |
| ----------------------------- | ----------------------------------- |
| room.create                   | name, settings?, password?          |
| room.join                     | code, displayName, password?        |
| room.leave / room.return      | 退出 / 結果からロビーへ             |
| room.ready / room.rename      | ready / name（自分）                |
| room.updateSettings           | expectedRevision, patch（部屋主）   |
| room.transferHost / room.kick | targetId（部屋主）                  |
| team.assign                   | targetId, team（部屋主または自分）  |
| team.autobalance.preview      | seed, headcountPenalty?（部屋主）   |
| team.autobalance.apply        | previewId, candidate:0..2（部屋主） |
| room.start                    | 接続中2〜10人、部屋主のみ           |
| input.configure               | dasMs, arrMs（開始前のみ）          |

room.snapshotはrevision・参加者・接続状態・READY・チーム・推定スキル・次試合用ルールを含みます。部屋コードは紛らわしい文字を除いた32文字集合から9桁（45bit）。パスワードはランダムsalt付きscryptハッシュをメモリに保持し、snapshotには含みません。途中参加は観戦・次試合待ちです。

## 対戦

開始時にrules/チーム/参加者を凍結。`match.prepare`で3秒後のstartAtと各プレイヤーseedのSHA-256コミットメントを通知します。開始時の`match.start`、以降10Hzの`match.snapshot`は、公開盤面全員分と本人だけの完全状態・selfRules・ackSeqを含みます。観戦者のselfはnullです。相手のqueue・HOLD・PRNG・ガベージ穴などの非公開状態を送信しません。終了時にseedを開示します。

本人の入力については、処理済みの `ackSeq` に加えて、受信済みの `receivedSeq`、サーバーで割り当てた実行tick付きの `pendingInputs`、現在の保持入力 `heldInput` を含みます。これらは本人専用で、観戦者には空の値を送ります。

`input.batch {matchId,frames:[{tick,seq,input}]}`は最大12フレーム。seqは0から連続、過去120tick〜未来30tickのみ受け付け、保留は120フレームまで。遅れた入力は次の処理可能tick以降へ順序を保って割当します。重力はサーバーの壁時計に基づく60Hzで進み、クライアントがtickを宣言しても加速しません。

入力はleft/right/softの保持状態、hard/cw/ccw/holdの1tickイベントです。途絶中は最後の保持状態を使い、切断を検出すると保持/保留を解除します。切断中も重力は進みます。復帰時は未確定入力を棄却し、元のプレイヤーの完全状態から再開します。

クライアントは入力を即時に同じstepで予測し、snapshotのackSeqまでを破棄して残りを実行tickに沿って再実行します。入力のないtickも重力と保持入力を進め、受信済み入力はサーバーの割当tickを使います。予測はサーバーの最新tickから入力遅延込みで24tick以内に制限します。古いsnapshotは適用せず、予測だけのトップアウトをKO表示にしません。KOイベント・死亡snapshot・試合終了が確定した後は予測で復活させません。`state.checksum {matchId,tick,hash}`の診断要求には、サーバーが保存した同tickのハッシュと異なる場合に`state.resync`を返します。

`INPUT_SEQUENCE`／`INPUT_TICK`／`INPUT_OVERFLOW`が返った場合は新規入力を一時停止し、`input.resync {matchId}`を送ります。サーバーは本人の保持・保留入力を解除し、`input.resynced {requestId,...MatchFrame}`で確定状態と処理済み番号を返します。その応答以後に新しい連番を送るため、エラー後の番号ずれを引きずりません。メインスレッド停止等で時刻が大きく飛んだ場合も古い未送信入力を送る前に同じ処理を行います。応答が3秒ない場合は再接続に移り、同期要求は毎秒2回／バースト4回に制限します。復帰ソケットが旧ソケットのcloseより先に到着しても、未確定入力は新接続へ引き継ぎません。解除操作は `input.reset` としてリプレイに記録します。

`target.select {targetId}`は生存敵のみ。全ターゲット方式で自分・味方・KO済を除外し、全員均等配分は総火力を保存します。lock/attack/koはmatch.event、終了はmatch.endで順位・チーム順位・KO・PPS/APM/APP・送信/相殺・時間を通知します。

## 制限

Origin完全一致、IP接続数20、全接続200、部屋100、1IPの新規接続毎秒1/バースト20、セッション毎秒120/バースト240、IP全体毎秒600/バースト1200。部屋作成と参加試行にも制限があります。15秒間隔のping/pong、10秒のhello期限、送信滞留2MiBで切断します。

本番はWSSとloopbackバインドを前提にします。TRUST_PROXY時もloopbackからのX-Forwarded-Forだけを使用します。ルール・攻撃・勝敗のクライアント申告は受け付けません。完全なアンチチートを保証する設計ではありません。
