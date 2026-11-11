---
title: エンドポイント
description: capture-workbench のサーバが答えるエンドポイント —— /healthz、台帳への素通し、書き込みのエンドポイント（クロールを始める・その場の TS の直し方を訊く）、その場の TS の宣言を訊くエンドポイント、WACZ の中身を読む /wacz/ のエンドポイント。Host の門、通すヘッダと、失敗の形
---

capture-workbench のサーバは中継しかしません。
workbench のロジックはブラウザの側（`public/`）に在り、サーバが持つのは、台帳と daemon への道と、workbench のファイルを配ることだけです。
置いた瞬間に「台帳が知っていることの写し」が生まれるので、ロジックはサーバに置きません。

| エンドポイント | 答えるもの |
| --- | --- |
| `GET /healthz` | サーバ自身（生存と、workbench が要る設定） |
| `POST /api/crawls` | 台帳へ（書き込み。クロールを始める） |
| `POST /api/crawls/:id/inline/:name/fix` | 台帳へ（書き込み。その場の TS の型の誤りの直し方を訊く） |
| `POST /api/scripts/check` | 台帳へ（その場の TS の宣言を訊く。何も書かないが、本文で source を送るので書き込みのエンドポイントと同じ門を通す） |
| `POST /api/schedules` | 台帳へ（書き込み。定期実行の予定を作る） |
| `POST /api/schedules/:id/<操作>` | 台帳へ（書き込み。`pause`・`resume`・`run`・`repin`・`delete`） |
| `POST /api/crawls/:id/failed` | 台帳へ（書き込み。走ったままのクロールを締める） |
| `/api/*`（ほか） | 台帳へ素通し（GET だけ） |
| `/wacz/:id/…` | 台帳に署名をもらい、daemon へ |
| それ以外 | `public/` のファイル |

エンドポイント（`POST /api/crawls` のような、HTTP の method と path の組）の振り分けは `src/server.mjs` に、`/wacz/` のエンドポイントの読みと組み替えは `src/wacz.mjs` に在ります。

どのエンドポイントも、要求の `Host` が `127.0.0.1:<ポート>` か `localhost:<ポート>` でなければ 403 で断ります。
よそのドメインの名前を 127.0.0.1 に向け直す手（DNS rebinding）で、別のサイトのページが workbench を自分のオリジンとして読むのを止めるためです。

## /healthz

生存と、workbench が要る設定を返します。

```json
{
  "ok": true,
  "subject": "alice",
  "organizations": ["acme"],
  "replaywebServerOrigin": "http://127.0.0.1:8899",
  "windmillOrigin": "http://127.0.0.1:8000",
  "windmillWorkspace": "crawler",
  "writeLimit": 1048576
}
```

workbench は開いたときにこれを読み、誰として見ているかと、深いリンクの行き先を知ります。
`writeLimit` は書き込みのエンドポイントが受ける本文の上限（バイト）で、新しいクロールの画面はこれを超える本文を送る前に止めます。
`/api/` の下には置きません。
あちらは台帳へ素通しする場所で、こちらの答えを混ぜると、どちらが答えたのかが読めなくなります。

## /api/* —— 台帳へ素通し

台帳は CORS（Cross-Origin Resource Sharing。別のオリジンのページからの要求を許す仕組み）の答えを返しません（`OPTIONS /api/archives` は 404）。
ブラウザから直に叩く道が塞がっているので、同一オリジンにするために通します。

- path と query はそのままで、台帳へは GET で通します。
  GET 以外は 405 です（書き込みのエンドポイントは下の `POST` の物だけ）。
- アクセストークンを `Authorization: Bearer` で付けます。
  まだ持っていなければ、先に開発用 issuer から取得します。
- **401 を受けたら、取得し直して 1 度だけやり直す。**
  寿命は数えません。
  issuer を起こし直すと鍵ごと変わるので、「まだ有効なはず」の時計は当てになりません。
  401 は、期限切れも鍵替わりも同じ形で言います。
- 台帳の答えは、状態と `content-type` と本文をそのまま返します。

どのエンドポイントを読むかは workbench（`public/app.js`）が決め、サーバは選びません。
エンドポイントの一覧（allowlist）は持っていません。
だから台帳の `GET /api/crawl-rules/check`（新しいクロールの画面が、書いている規則を確かめる）と `GET /api/crawls/:id/decisions`（開いたクロールの規則が何を決めたか）、`GET /api/crawls/:id/pages`（開いたクロールのページの表）と `GET /api/crawls/:id/pages/:page/log`（1 ページのログ）、`GET /api/crawls/:id/diagnostics`（型の検査で落ちたクロールの型の誤り）、`GET /api/search`（検索の画面が引く全文検索）も、ここでは何も要りません。どれも読み取りのエンドポイントで、一覧と同じく素通しです。
ページの表の続きは、台帳が本文の `next` で言います（中継が返すのは状態と `content-type` と本文だけで、ほかのヘッダは落ちるため）。

## POST /api/crawls —— クロールを始める

workbench のサーバが持つ書き込みのエンドポイントの 1 つです。
新しいクロールの画面の欄（[画面](/screens/)）が使います。
中身は検査せず、門を通った本文をそのまま台帳の `POST /api/crawls` へ渡し、答えをそのまま返します。
起点の URL も方針（深さ・枚数・走らせるスクリプト）も、`userAgent` も、クロールごとの変数（`variables`。名前の綴り・数・値の長さと形・走るスクリプトが宣言した名前か）も、検査して決めるのは台帳です。
宣言したシークレットが Windmill に在るかも台帳が確かめ、workbench はシークレットの値に触りません（値は Windmill の変数に在り、workbench の欄にも本文にもありません）。

- **workbench のページからの JSON だけを通す。**
  `Origin` が workbench でなければ 403、`content-type` が JSON でなければ 415、本文が 1 MiB を超えたら 413 です（起点の URL と、欄で書いた TS の合計。台帳の `POST /api/crawls` と同じ上限）。
  別のサイトのページに、利用者のブラウザから POST させる手（CSRF）を止めるためです。
  Chrome の Private Network Access には頼りません。
- アクセストークンの付け方と、401 でのやり直しは、上の `/api/*` と同じです。

| 台帳の答え | いつ |
| --- | --- |
| 202 `{"crawlId": …}` | 受理した（完了は待たない） |
| 400 `{"error": …}` | 読めない起点の URL や、台帳にスクリプトが無いとき（`hint` つき）、知らないスクリプトの id や同じ id の重ね（`ids` つき）、必須の変数が無い・宣言に無い変数（`names` つき）、宣言したシークレットが Windmill に無い・secret でない（`secrets` に名前と path）、隠すシークレットを送るのに配備の形式が値を置き換えられない（`names` と `hint` つき）など |
| 404 | 名乗りにクロールを始める許可が無い（`{"error":"not found"}`）か、台帳にクロールの投げ先の設定が無く、エンドポイントごと無い |
| 409 `{"error": …, "crawlId": …}` | 走行中のクロールがある（全体で 1 本）。`crawlId` が塞いでいる 1 本 |
| 503 `{"error": "windmill unreachable"}` | 宣言したシークレットが在るかを Windmill に訊けない（flow も動かないので、台帳はクロールを始めない） |

門の判定は `src/lib.mjs` の `writeRefusal` に在り、試験から直接呼べます。

## POST /api/scripts/check —— その場の TS の宣言を訊く

新しいクロールの画面が、箱が 800 ms 止まると 1 本ずつ呼び、`defineParams` で宣言された変数の欄を描きます（[画面](/screens/)）。
本文は `{ source, phase }` です。台帳は行を立てず、ts-compile-service に訊いて `{ params, diagnostics }` を返します。workbench のサーバは本文と答えをそのまま渡します。

- 何も書きませんが、`POST /api/crawls` と同じ門（`Origin`・JSON・1 MiB）を通り、同じトークンを付けます。source を本文で運ぶエンドポイントで、別のサイトのページから ts-compile-service を働かせられないようにするためです。
  形は `src/lib.mjs` の `isWriteRoute` に在り、query も `/check` の後ろの足しも通しません。

| 台帳の答え | いつ |
| --- | --- |
| 200 `{ params, diagnostics }` | 訊けた。`diagnostics` は source の誤りで、足りない必須の変数（`BH0001`）は除く（欄がそのために在るため）。画面が出すのは `BH0002` と `BH0004` だけ |
| 400 | 本文の形が違う（Fastify の `message`） |
| 404 | 名乗りにクロールを始める許可が無い（`{"error":"not found"}`）か、台帳に ts-compile-service の設定が無く、エンドポイントごと無い |
| 503 `{"error": "ts-compile unreachable"}` | ts-compile-service が答えない |

## POST /api/schedules —— 定期実行の予定

定期実行の画面（[画面](/screens/)）と、新しいクロールの画面の「定期にする」が使います。
予定を作る `POST /api/schedules`、操作の `POST /api/schedules/:id/<操作>`、走ったままの行を締める `POST /api/crawls/:id/failed` の 3 つの形です。
読むのは `GET /api/schedules` で、ほかの読み取りのエンドポイントと同じ素通しです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。本文が無い操作も `{}` を送ります。
- **中継するのは、この形ちょうどだけ。**
  操作は `pause`・`resume`・`run`・`repin`・`delete` の 5 つで、id は 16 進の数字とハイフンです。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。
- **消すのも POST です。** 中継の書き込みのエンドポイントは POST だけなので、台帳のエンドポイントもその形にしてあります。
- 判断は台帳がします。cron の式も頼みの中身も、断る文は台帳の物をそのまま出します。

## POST /api/crawls/:id/inline/:name/fix —— その場の TS の直し方を訊く

これも書き込みのエンドポイントです。
型の検査で落ちたクロールを開き、型の誤りの在るその場の TS の「直し方を訊く」を押すと使います（[画面](/screens/)）。
本文は `{}` です。
台帳が Claude に訊き、**クロールが落ちたのと同じ型の検査に通った直しだけ**を、理由・置き換えた行・往復の回数・費用つきで返します。
workbench は答えを描くだけです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。
- **中継するのは、この形ちょうどだけ。**
  id は 16 進の数字とハイフン、名前は小文字・数字・ハイフンで、`/fix` の後ろには何も付きません。
  `%` と `.` は通しません。
  `fetch` は URL の `..`（`%2e%2e` も）を畳むので、通すと台帳のほかのエンドポイントに POST が届いてしまいます。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。

| 台帳の答え | いつ |
| --- | --- |
| 200 `{ rounds, source, edits, notes, compiled, usage }` | 検査に通った直しがある（`edits` は置き換えた範囲ごとの `before` と `after`、`usage.usd` は費用） |
| 409 `scripts compile` | いまの組み合わせが型を通る（直す物が無い） |
| 422 | クロールに必須の変数が足りない（`missing variables`。Claude は呼ばず、画面は値を渡して始め直すよう言う）、誤りがこのスクリプトに無い、2 往復で通らなかった（回数と費用つき）、Claude が断った |
| 429 `claude budget exhausted` | 組織がこの月の上限に届いた（`spentUsd` と `budgetUsd` つき）。Claude は呼ばない |
| 502・503 | Claude か ts-compile-service が答えなかった |
| 404 | 名乗りにクロールを始める許可が無い、クロールかその場の TS が無い、台帳に API の鍵が無くエンドポイントごと無い |

## /wacz/:id/… —— WACZ の中身を読む

WACZ（撮ったページを 1 つの ZIP にまとめたアーカイブ）を検証し、中を読むエンドポイントです。
中の WARC（撮った要求と応答を順に記録するファイル）や索引は、窓に分けて読みます。

| workbench が呼ぶ | daemon へ | 返すもの |
| --- | --- | --- |
| `POST /wacz/:id/validate` | `POST /validate` | 検証の報告 |
| `GET /wacz/:id/lines?path=&from=&count=` | `POST /lines` | 行の窓 |
| `GET /wacz/:id/line?path=&n=` | `POST /line` | 1 行を丸ごとと、割った fields |
| `GET /wacz/:id/records?path=&from=&count=` | `POST /records` | WARC を頭から歩いたレコードの一覧 |
| `GET /wacz/:id/record?path=&offset=&length=` | `POST /record` | 1 レコード（WARC の見出し・HTTP・本文） |
| `GET /wacz/:id/record/body?path=&offset=&length=` | `POST /record/body` | 画像の実体。raster だけで、`nosniff` と `sandbox` つき。他は 415 |

この表は、`src/wacz.mjs` の `OPS` と突き合わされます（`npm run site:check`）。
エンドポイントを足すときは、`OPS` と `paramsFor` とこの表の 3 か所を直します。

- **どのエンドポイントも同じ 2 段。**
  台帳の `POST /api/archives/:id/url` で署名をもらい、その URL を daemon に渡します（順番の意味は [WACZ を見る](/wacz/)）。
- **workbench が呼ぶのは GET、daemon へは POST。**
  `<img src>` も GET なので、画像の実体も GET で呼べるようにしてあります。
  検証だけは workbench からも POST です（押したときだけ走らせる）。
- daemon へ送る本文は `{ "source": { "kind": "uri", "uri": "<署名付き URL>" }, …引数 }` です。
  検証の引数は `locale` だけです。

## 通すヘッダ

上流（台帳か daemon）の答えから通すヘッダは allowlist で、`src/server.mjs` の `PASS_HEADERS` が決めます。
daemon の `date` や `connection` は、workbench の応答に混ぜません。
画像の実体は bytes のまま、daemon が付けた印（`nosniff`・`sandbox`・`no-store`）ごと通します。

## 失敗の形

失敗は、何が居ないかを言います。
「見えない」と「立っていない」を混ぜません。

| 状態 | いつ | 本文 |
| --- | --- | --- |
| 400 | `/wacz/` のエンドポイントの引数が足りない、または数でない。台帳へは行かない | `{"error":"from is required"}` |
| 403 | `Host` が workbench の host:port でない（どのエンドポイントも）。書き込みのエンドポイントでは、`Origin` が workbench でないときも | `{"error":"workbench の Host ではない"}` など |
| 405 | method が違う。`/wacz/` のエンドポイント（検証は POST、他は GET）と、`/api/*`（GET だけ。書き込みのエンドポイントを除く） | `POST だけ`・`GET だけ` など（`Allow` ヘッダつき） |
| 413 | 書き込みのエンドポイントの本文が 1 MiB を超えた | `{"error":"本文が 1048576 バイトを超えた"}` |
| 415 | 書き込みのエンドポイントの `content-type` が JSON でない | `{"error":"JSON だけを受ける"}` |
| 台帳のまま | 台帳が断った（見てよくない archive の 404 など） | 台帳の本文 |
| 502 | issuer・台帳・daemon に届かない、または issuer が名乗りを断った | `{"error":"… に届かない (…)。…"}`。直し方の 1 文つき |
| 404 | `public/` に無いファイル、または配らない拡張子 | `not found` |

答えを流している途中で上流が切れたら、頭はもう書けないので、接続を閉じます。
