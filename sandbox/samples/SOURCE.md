# サンドボックスの WACZ の標本

出どころは 2 つ: 検証の結果を見るための 5 本（corpus から）と、経緯の画面を見るための 1 本（BrowserHive の取り込み）。

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
  [ "$(basename "$f")" = trace-timeline.wacz ] && continue  # corpus の物ではない（下の節）
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
