# サンドボックスの WACZ の標本

出どころは 3 つ: 検証の結果を見るための 5 本（corpus から）、経緯の画面を見るための 1 本（BrowserHive の取り込み）、節目のスクリーンショットを見るための 3 本（BrowserHive の e2e の取り込み）。後ろの 2 つの節は、WACZ の外に置いた絵の出どころ。

## corpus から写した 5 本

[wacz-validator-corpus](https://github.com/uraitakahito/wacz-validator-corpus) の **v0.3.0** の
`fixtures/` から写した（corpus では Git LFS で持っている。ここには実物を置いた）。
corpus を更新しても、ここは自動では変わらない。上げるなら、写し直してこの表も直す。

| ファイル | corpus での期待（spec profile） | sha256 |
| --- | --- | --- |
| `good.wacz` | 全 rule を pass | `7596416ce2c551c61642ed95c0be1bad9e707125397f5bcac537121b9a512898` |
| `warc-payload-digest-bad.wacz` | 警告 1 | `cc48d98717cef0b260b7b9100035fa54b110d5bd565b0c0ec300c7cf413e7960` |
| `datapackage-bad-hash.wacz` | 失敗 1 | `8a59033a803cfa170cb0c3690b838e164a46626f268d4373e9c5af5062d25191` |
| `cdxj-length-mismatch.wacz` | 失敗 1 | `a4bb9ffab1d8aa315f25f2d9e03a26f9fb0b136b88579613feab473389ca887b` |
| `wacz-missing-indexes.wacz` | 失敗 2 | `c333c73c4b5db2ad489d2eb7565f6da22749900f618065a323bf381d5857664a` |

corpus の LFS の pointer と同じ中身かは、次で確かめられる（corpus を隣に置いて）:

```sh
for f in sandbox/samples/*.wacz; do
  case "$(basename "$f")" in trace-timeline.wacz|with-screenshots.wacz|without-screenshots-*.wacz) continue ;; esac  # corpus の物ではない（下の節）
  want=$(git -C ../wacz-validator-corpus show "v0.3.0:fixtures/$(basename "$f")" | sed -n 's/^oid sha256://p')
  got=$(shasum -a 256 "$f" | cut -d' ' -f1)
  [ "$want" = "$got" ] && echo "ok  $f" || echo "NG  $f"
done
```

corpus は Unlicense（public domain）。

## BrowserHive の取り込みの 1 本

| ファイル | 何か | sha256 |
| --- | --- | --- |
| `trace-timeline.wacz` | BrowserHive **v30.0.0** が、[capture-fixtures](https://github.com/uraitakahito/capture-fixtures) の `/charset/` を 2026-11-13 に撮った WACZ（署名なし・要求と応答の対が 11 個・WARC は `archive/data-000.warc.gz` の 1 本） | `16ae219d159f2e9b535cfa0c7b685cbd928f7bdd0c0fe70db1de5982365ec22c` |

経緯の画面（`#trace/…`。CAPTURE-270）を見るための物。corpus の標本は BrowserHive の取り込みではないので、ログと時刻の合う
レコードを持たない。台本（`sandbox/scenario.json`）のクロール `5b0c000b` のページ 1301 が、このファイルの id（ファイル名から
決まる）と、同じ取り込みの答え（取り込みの欄・ログ・要求の行 `trace`）を持つ。画面は、1301 では要求を `trace` の行から
棒にし、WACZ のレコードは読まない。ページ 1303 は、同じ取り込みを `trace` の無い答えの形（BrowserHive v30.0.0 より前）に
した物で、画面はこの WACZ のレコードの `WARC-Date` から要求の印を置く。
**WACZ と答えは同じ 1 回の取り込みの物なので、WACZ を差し替えるなら、台本の 1301 と 1303 の答えも同じ取り込みの物に替える。**

中に在るのは capture-fixtures の頁だけ（手元のスタックの中の名前 `capture-fixtures.capture-ledger:8080` で撮った）。
capture-fixtures は Unlicense（public domain）。

## BrowserHive の e2e の取り込みの 3 本（節目のスクリーンショット）

BrowserHive **v30.2.0** の e2e（絵を撮る設定のスタック。WACZ の `software` は `browserhive/30.1.0+1.g1ba36b06` ——
v30.2.0 になった変更を、タグを打つ前に建てた build）が、capture-fixtures を 2026-11-13 に撮った WACZ。どれも署名なしで、WARC は
`archive/data-000.warc.gz` の 1 本。e2e が保管庫に置いた物を、名前だけ替えて写した。

| ファイル | 何か | sha256 |
| --- | --- | --- |
| `with-screenshots.wacz` | `/marked/search/public` を、検索するスクリプト（`marked-search`）つきで撮った物。節目のスクリーンショットが 2 枚（`after-load` は検索の前、`after-behaviors` は検索の後。WebP・1280×800）。絵は WARC の resource レコードで、索引（`indexes/index.cdxj`）に絵の URI を鍵にした行が在る | `abe9294ee7f514682ec22a609f69c1d014e7950b96c1149e0cfa91f21e39a965` |
| `without-screenshots-withheld.wacz` | `/marked/text/secret` を、content-type の方針（`text/plain` を `no-body`）つきで撮った物。文書を伏せたので、どの時点の絵も残していない（`skipped: withheld`） | `2db7f5a6c32632f3dce76dac204408da5b6ddbdd282b9f7b9f4afa1825595c2f` |
| `without-screenshots-secret.wacz` | `/plain-html` を、シークレット（`token`。隠す）を渡して撮った物。どの時点の絵も残していない（`skipped: secret`）。シークレットの値は、WARC の中で `***` に置き換えてある | `5c6c28c2bbd2fd14600f89f9ff1401f0341f6563f97c2840f84f0bb34f21954d` |

経緯の画面の、節目のスクリーンショットを見るための物（CAPTURE-270 の第 4 部）。筋書き（`sandbox/scenario.json`）のクロール
`5b0c000b` のページ 1304・1305・1306 が、この順にファイルの id（ファイル名から決まる）を持つ。ページの答えのうち、絵の成り行き
（`capture.screenshots`）・`settle`・`completeness`・`document` と、ログ・`trace` の行は、WACZ の中（`datapackage.json` の
`browserhive:capture`・`logs/capture.jsonl`・`trace/events.jsonl`）に在るまま —— `test/sandbox.test.mjs` が照らす。
WACZ に無い欄（`status`・`timestamp`・`captureProcessingTimeMs`・`httpStatusCode`）は、筋書きが組んだ
（`timestamp` は `datapackage.json` の `created`）。**WACZ を差し替えるなら、筋書きの答えも同じ取り込みの物に替える。**

アーカイブの画面の並びは、capture-ledger と同じく撮った時刻の新しい順（同じ時刻なら名前の順）。筋書きはこの 3 本と
`trace-timeline.wacz` に本当の撮った時刻（同じ WACZ を指す筋書きのページの `capturedAt`）を書くので、4 本は corpus の標本
（筋書きの既定の時刻）より前に来る。docs の絵 `archives` は表の頭から 5 行を写し、その中に絵の在る行・絵を残さなかった行
（`withheld`・`secret`）・記録の無い行が並ぶ。

中に在るのは capture-fixtures の頁だけ（e2e のスタックの中の名前 `capture-fixtures-N-a.browserhive:8080` で撮った）。

## 一覧の行の絵

`sandbox/screenshots/marked-search-after-load.webp`（5,624 バイト・sha256 `fcce557a46dcbd1e26c2a051683605e0541fa241089a4a24685621554480fca9`）は、
`with-screenshots.wacz` の `after-load` の節目のスクリーンショット —— WARC の resource レコード
（`urn:browserhive:screenshot:after-load:…`）の本文を、1 バイトも変えずに取り出した物。代役の
`GET /api/archives/:id/screenshots/after-load` が、筋書きの `stageScreenshots` の名指しで返す（capture-ledger は同じ本文を
保管庫の WACZ から読んで返す）。`test/sandbox.test.mjs` が、WACZ の中のレコードの本文と同じバイト列かを照らす。
**`with-screenshots.wacz` を差し替えるなら、この絵も取り出し直す。**

## 失敗の時点の絵

`sandbox/failure-screenshots/fails-then-succeeds-503.webp` は、筋書きのページ 1307（文書が 503 を返した取り込み）の
失敗の時点の絵。**BrowserHive が置いた `.failure.webp` ではない** —— capture-fixtures の `/fails-then-succeeds` が
503 と一緒に返す本文（題と見出しが `retry` の HTML）を、手元の Chrome（1280×800・DPR 1・ライトの配色）に描かせ、BrowserHive と同じ
設定（WebP・quality 80）で撮った物。1307 の答え（取り込みの欄・ログ・`trace`）も本物の取り込みの物ではなく、
BrowserHive v30.2.0 の `http_error` の答えの形に筋書きが組んだ。
