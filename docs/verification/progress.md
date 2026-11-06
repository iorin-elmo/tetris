# 検証記録

設計書の Phase 1 → 6 の順に、共有エンジンから実装する。原作実機・Raspberry Pi 実機での確認結果は、実測するまで合格扱いにしない。

## PROJECT_DEFAULT

60Hz、DAS 150ms、ARR 30ms、接地30tick、接地リセット15回、出現0tick、消去6tick、ガベージ移動30tick、上昇上限8行。Miniの火力とB2B例外、PCのREN/B2B非加算、TETR.IO風ガベージは未実測の初期ルール。SRSは90度のみ。

検証結果・残課題は実装フェーズごとに追記する。
