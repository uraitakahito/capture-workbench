---
title: エンドポイント
description: capture-workbench のサーバが答えるエンドポイント —— /healthz、サインイン、capture-ledger への素通し、書き込みのエンドポイント（クロールを始める・その場の TS の直し方を訊く・定期実行の予定を作る／操作する・走ったままのクロールを締める・差分を Claude に要約させる・robots.txt の例外を登録する／取り消す）、その場の TS の宣言を訊くエンドポイント、WACZ の中身を読む /wacz/ のエンドポイント。Host の門、通すヘッダと、失敗の形
---

capture-workbench のサーバは中継しかしません。
workbench のロジックはブラウザの側（`public/`）に在り、サーバが持つのは、capture-ledger と daemon への道と、workbench のファイルを配ることだけです。
置いた瞬間に「capture-ledger が知っていることの写し」が生まれるので、ロジックはサーバに置きません。

| エンドポイント | 答えるもの |
| --- | --- |
| `GET /healthz` | サーバ自身（生存と、workbench が要る設定） |
| `GET /login`・`GET /callback`・`GET /logout` | サーバ自身（IdP でのサインインと、サインアウト） |
| `POST /api/crawls` | capture-ledger へ（書き込み。クロールを始める） |
| `POST /api/crawls/:id/inline/:name/fix` | capture-ledger へ（書き込み。その場の TS の型の誤りの直し方を訊く） |
| `POST /api/capture-scripts/check` | capture-ledger へ（その場の TS の宣言を訊く。何も書かないが、本文で source を送るので書き込みのエンドポイントと同じ門を通す） |
| `POST /api/schedules` | capture-ledger へ（書き込み。定期実行の予定を作る） |
| `POST /api/schedules/:id/<操作>` | capture-ledger へ（書き込み。`pause`・`resume`・`run`・`repin`・`delete`） |
| `POST /api/crawls/:id/failed` | capture-ledger へ（書き込み。走ったままのクロールを締める） |
| `POST /api/archives/:id/changes/summary` | capture-ledger へ（書き込み。選んだ 2 本の取り込みの差分を、Claude に要約させる） |
| `POST /api/robots-exemptions` | capture-ledger へ（書き込み。robots.txt の例外を登録する） |
| `POST /api/robots-exemptions/:id/revoke` | capture-ledger へ（書き込み。robots.txt の例外を取り消す） |
| `GET /api/archives/:id/screenshots/:stage` | capture-ledger へ素通し（節目のスクリーンショット。字でなく WebP のバイト列のまま通す） |
| `/api/*`（ほか） | capture-ledger へ素通し（GET だけ） |
| `/wacz/:id/…` | capture-ledger に署名をもらい、daemon へ |
| 画面の path への `GET`（`/crawls`・`/crawls/<id>`・`/trace/…`・`/archive/…` など。頭の語は `public/paths.js` の `SCREENS`） | `public/index.html`。画面が path から開く（サインインの設定が在ってセッションが無ければ、`/login?back=<path>` へ回す） |
| それ以外 | `public/` のファイル |

エンドポイント（`POST /api/crawls` のような、HTTP の method と path の組）の振り分けは `src/server.mjs` に、`/wacz/` のエンドポイントの読みと組み替えは `src/wacz.mjs` に在ります。

どのエンドポイントも、要求の `Host` が `127.0.0.1:<ポート>` か `localhost:<ポート>` でなければ 403 で断ります。
よそのドメインの名前を 127.0.0.1 に向け直す手（DNS rebinding）で、別のサイトのページが workbench を自分のオリジンとして読むのを止めるためです。

## /healthz

生存と、workbench が要る設定を返します。

```json
{
  "ok": true,
  "signedIn": { "user": "alice", "groups": ["acme"] },
  "replaywebPlayerOrigin": "http://127.0.0.1:8899",
  "capturePlayerOrigin": "http://127.0.0.1:8897",
  "windmillOrigin": "http://127.0.0.1:8000",
  "windmillWorkspace": "crawler",
  "writeLimit": 1048576
}
```

workbench は開いたときにこれを読み、誰としてサインインしているかと、深いリンクの行き先を知ります。
`signedIn` は、アクセストークンの `username` と `cognito:groups` を、署名を確かめずに読んだ物です（確かめるのは capture-ledger）。
セッションが無ければ `null` です。
`writeLimit` は書き込みのエンドポイントが受ける本文の上限（バイト）で、新しいクロールの画面はこれを超える本文を送る前に止めます。
`/api/` の下には置きません。
あちらは capture-ledger へ素通しする場所で、こちらの答えを混ぜると、どちらが答えたのかが読めなくなります。

## /login・/callback・/logout —— サインイン

人は IdP（Identity Provider。本番は Amazon Cognito、手元は capture-ledger の compose のサービス `idp` の [Floci](https://github.com/floci-io/floci)）でサインインします。
流れは authorization code と PKCE（Proof Key for Code Exchange）です。
コードは `src/auth.mjs` に在ります。

- `GET /login` は、IdP の discovery（`<WORKBENCH_OIDC_ISSUER>/.well-known/openid-configuration`）を 1 度だけ読み、新しい `state` と PKCE の verifier を覚えて、IdP のサインインの画面へ回します。
  `?back=<path>` が在れば、サインインの後に戻す画面も `state` と一緒に覚えます（`/crawls/<id>` のような画面の path で 2,000 字までの物だけ。ほかは `/` に戻す）。
  `WORKBENCH_OIDC_ISSUER` と `WORKBENCH_OIDC_CLIENT_ID` が無ければ、その 2 つを名指す 503 を返します。
- `GET /callback` は、IdP が戻す先です。
  **`state` を照らし、1 つの `state` は 1 度だけ通す。**
  よそのページが作った戻り・時間が掛かりすぎた戻り・2 度目は 400 です。
  code を IdP の token endpoint でトークンに替え、メモリのセッションに持ち、cookie `workbench_session`（HttpOnly・SameSite=Lax）を付けて、覚えた画面（無ければ `/`）へ回します。
- `GET /logout` は、セッションと cookie を消して、**IdP の logout のエンドポイント**（`…/logout?client_id=…&logout_uri=http://127.0.0.1:<WORKBENCH_PORT>/login`）へ回します。
  IdP は自分のサインイン（ブラウザの cookie）を消して `/login` へ戻すので、サインインのフォームに着きます —— 別の利用者でサインインし直せます。
  workbench のセッションだけを消すと、IdP のサインインが残り、フォームを出さずに同じ利用者で戻ってきます。
  IdP の logout のエンドポイントは discovery に載っていないので、authorize のエンドポイント（`…/oauth2/authorize`）から作ります（Cognito の形）。
  サインインの設定が無い・discovery に届かない・その形でないときは、前のとおり `/` へ回し、訳を標準エラーに書きます。
  IdP から出ても、出ているトークンは取り消されません（期限まで有効。workbench はメモリから捨て、ブラウザには渡していません）。
- セッションが無いとき（サインインの設定が在るとき）、画面の path は `/login?back=<その path>` へ回します。
  `/` は、古い `/#…` のアドレスを path に替えて `/login?back=…` へ回す小さなページを返します（server は `#` の後ろを見られない）。

戻り先は `http://127.0.0.1:<WORKBENCH_PORT>/callback`、サインアウトの後の戻り先は `http://127.0.0.1:<WORKBENCH_PORT>/login` で、どちらも IdP の app client に登録した物と一字一句同じでなければなりません（query を足しても断られます）。
手元の Floci には capture-ledger の `pnpm run idp:bootstrap` が登録します（`dev:up` が毎回打つ）。
**本番の Cognito では、app client の「許可するサインアウト URL」に `http://127.0.0.1:<WORKBENCH_PORT>/login` を登録します。**
登録が無いと、「サインアウト」が IdP の `logout_uri is not registered for this client`（400）で止まります —— 手元で出たら、capture-ledger で `pnpm run idp:bootstrap` を打ち直します（プールは作り直されず、サインインもそのまま）。
IdP から戻る道は GET のリダイレクトなので、これらは GET で、書き込みのエンドポイントの門（`Origin`・JSON）は掛けません。
代わりに `state` と PKCE が、よそのページが作った戻りを断ります。
**`/logout` は守っていません。** GET のリンクのままなので、よそのページがブラウザを `/logout` へ飛ばすと、サインアウトさせられます（害は、サインインのし直しだけ。読める物・書ける物は増えません）。

## /api/* —— capture-ledger へ素通し

capture-ledger は CORS（Cross-Origin Resource Sharing。別のオリジンのページからの要求を許す仕組み）の答えを返しません（`OPTIONS /api/archives` は 404）。
ブラウザから直に叩く道が塞がっているので、同一オリジンにするために通します。

- path と query はそのままで、capture-ledger へは GET で通します。
  GET 以外は 405 です（書き込みのエンドポイントは下の `POST` の物だけ）。
- **頼みの言語は運びます。ブラウザのほかの見出しは運びません。**
  頼みの `Accept-Language` が、ちょうど `ja` か `en`（ページが付ける、画面の言語）のときだけ、capture-ledger へ運びます。
  言語を見る版の capture-ledger（v0.119.0 から）は、自分で書く文（1 枚も撮れなかったクロールの `error`）を、その言語で返します。その前の版は見出しを読まず、保存された字を返します。
  ブラウザが自分で付ける値（`ja,en-US;q=0.9`）は運びません。ブラウザの設定で、画面の言語ではないためです。
  言語を見る版の capture-ledger は、言語の付かない頼みには英語で返します。下の `POST` のエンドポイントも、同じく運びます。
- そのセッションのアクセストークンを `Authorization: Bearer` で付けます。
  セッションが無ければ 401 `{"error":"not signed in","params":{},"login":"/login"}` を返し、ページは `/login` へ移ります。
- **capture-ledger から 401 を受けたら、refresh token で取得し直して 1 度だけやり直す。**
  寿命は数えません。
  IdP のプールを作り直すと鍵ごと変わるので、「まだ有効なはず」の時計は当てになりません。
  401 は、期限切れも鍵替わりも同じ形で言います。
  refresh token でも取れなければセッションを消し、401（`sign-in expired`。画面の字は「サインインが切れました」）でサインインし直してもらいます。
- capture-ledger の答えは、状態と `content-type` と本文をそのまま返します。
  本文は字として読んで返します。
- **例外は、節目のスクリーンショットの `GET /api/archives/:id/screenshots/:stage` だけ。**
  答えは WebP のバイト列なので、字として読まず、状態と見出し（下の[通すヘッダ](#通すヘッダ)の allowlist）と本文のバイト列をそのまま流します。
  字として読むと、UTF-8 として読めないバイトが置き換わり、絵が壊れます。
  形は `src/lib.mjs` の `isScreenshotRoute` に在ります。id は 36 字の 16 進の数字とハイフン、時点は `after-load` と `after-capture-scripts` だけで、query も末尾の足しも `%` も通しません（通らない形は、ほかと同じく字として素通しします）。
  アーカイブの一覧とページの表の「見た目」（[画面](/screens/)）が `<img>` で引きます。

どのエンドポイントを読むかは workbench（`public/app.js`）が決め、サーバは選びません。
エンドポイントの一覧（allowlist）は持っていません。
だから capture-ledger の `GET /api/crawl-rules/check`（新しいクロールの画面が、書いている規則を確かめる）と `GET /api/crawls/:id/decisions`（開いたクロールの規則が何を決めたか）、`GET /api/crawls/:id/pages`（開いたクロールのページの表）と `GET /api/crawls/:id/pages/:page/log`（1 ページのログ）と `GET /api/crawls/:id/pages/:page/trace`（1 ページの取り込みの経緯）と `GET /api/crawls/:id/pages/:page/trace/failure-screenshot`（その取り込みの失敗の時点の絵）、`GET /api/crawls/:id/diagnostics`（型の検査で落ちたクロールの型の誤り）、`GET /api/search`（検索の画面が引く全文検索）、`GET /api/history`（履歴が引く、同じ URL の取り込みの一覧）と `GET /api/archives/:id/changes`（履歴で選んだ 2 本の差分）、`GET /api/robots-exemptions`（robots.txt の例外の画面が並べる行）、`GET /api/archives/:id/screenshots/:stage`（撮った時の絵。返し方だけが上の例外）も、ここでは何も要りません。どれも読み取りのエンドポイントで、一覧と同じく素通しです。
ページの表の続きは、capture-ledger が本文の `next` で言います（中継が返すのは状態と `content-type` と本文だけで、ほかのヘッダは落ちるため）。

## POST /api/crawls —— クロールを始める

workbench のサーバが持つ書き込みのエンドポイントの 1 つです。
新しいクロールの画面の欄（[画面](/screens/)）が使います。
中身は検査せず、門を通った本文をそのまま capture-ledger の `POST /api/crawls` へ渡し、答えをそのまま返します。
起点の URL も方針（深さ・枚数・走らせる capture scripts）も、`userAgent` も、クロールごとの変数（`variables`。名前の綴り・数・値の長さと形・走る capture scripts が宣言した名前か）も、検査して決めるのは capture-ledger です。
宣言したシークレットが Windmill に在るかも capture-ledger が確かめ、workbench はシークレットの値に触りません（値は Windmill の変数に在り、workbench の欄にも本文にもありません）。

- **workbench のページからの JSON だけを通す。**
  `Origin` が workbench でなければ 403、`content-type` が JSON でなければ 415、本文が 1 MiB を超えたら 413 です（起点の URL と、欄で書いた TS の合計。capture-ledger の `POST /api/crawls` と同じ上限）。
  別のサイトのページに、利用者のブラウザから POST させる手（CSRF）を止めるためです。
  Chrome の Private Network Access には頼りません。
- アクセストークンの付け方と、401 でのやり直しは、上の `/api/*` と同じです。
- **画面は「始める」に鍵（`Idempotency-Key`）を付け、サーバはそれを capture-ledger へ運びます。**
  鍵は押したときにブラウザが作り（`crypto.randomUUID()`）、答えが届かない（繋がらない・5xx）間は、同じ本文で押し直しても同じ鍵を送ります。
  capture-ledger は鍵ごとに最初の答えを覚えているので、応答が切れた後に押し直しても 2 本目は始まらず、最初のクロールが返ります。
  欄を直してから押すと本文が変わるので、鍵も作り直します。202 か 4xx を受け取った後に押すと、新しい鍵です。
  ほかに運ぶ見出しは、頼みの言語（上の `/api/*` の項）だけです。ほかの書き込みのエンドポイントには、鍵は運びません。

| capture-ledger の答え | いつ |
| --- | --- |
| 202 `{"crawlId": …}` | 受理した（完了は待たない） |
| 400 `{"error": …}` | 読めない起点の URL や、登録済みの capture scripts が無いとき（`hint` つき）、知らない capture script の id や同じ id の重ね（`ids` つき）、必須の変数が無い・宣言に無い変数（`names` つき）、宣言したシークレットが Windmill に無い・secret でない（`secrets` に名前と path）、隠すシークレットを送るのに配備の形式が値を置き換えられない（`names` と `hint` つき）など。capture-ledger v0.102.0 からは、`hint` の在る答えに `hints` も載る（同じ理由を `{ key?, params?, text }` の並びにした物で、ページが画面の言語の文にするために読む） |
| 404 | 名乗りにクロールを始める許可が無い（`{"error":"not found"}`）か、capture-ledger にクロールの投げ先の設定が無く、エンドポイントごと無い |
| 409 `{"error": …, "crawlId": …}` | 走行中のクロールがある（全体で 1 本）。`crawlId` が塞いでいる 1 本 |
| 503 `{"error": "windmill unreachable"}` | 宣言したシークレットが在るかを Windmill に訊けない（flow も動かないので、capture-ledger はクロールを始めない） |

門の判定は `src/lib.mjs` の `writeRefusal` に在り、試験から直接呼べます。

## POST /api/capture-scripts/check —— その場の TS の宣言を訊く

新しいクロールの画面が、箱が 800 ms 止まると 1 本ずつ呼び、`defineParams` で宣言された変数の欄を描きます（[画面](/screens/)）。
本文は `{ source, phase }` です。capture-ledger は行を立てず、ts-compile-service に訊いて `{ params, diagnostics }` を返します。workbench のサーバは本文と答えをそのまま渡します。

- 何も書きませんが、`POST /api/crawls` と同じ門（`Origin`・JSON・1 MiB）を通り、同じトークンを付けます。source を本文で運ぶエンドポイントで、別のサイトのページから ts-compile-service を働かせられないようにするためです。
  形は `src/lib.mjs` の `isWriteRoute` に在り、query も `/check` の後ろの足しも通しません。

| capture-ledger の答え | いつ |
| --- | --- |
| 200 `{ params, diagnostics }` | 訊けた。`diagnostics` は source の誤りで、足りない必須の変数（`BH0001`）は除く（欄がそのために在るため）。画面が出すのは `BH0002` と `BH0004` だけ |
| 400 | 本文の形が違う（Fastify の `message`） |
| 404 | 名乗りにクロールを始める許可が無い（`{"error":"not found"}`）か、capture-ledger に ts-compile-service の設定が無く、エンドポイントごと無い |
| 503 `{"error": "ts-compile unreachable"}` | ts-compile-service が答えない |

## POST /api/schedules —— 定期実行の予定

定期実行の画面（[画面](/screens/)）と、新しいクロールの画面の「定期にする」が使います。
予定を作る `POST /api/schedules`、操作の `POST /api/schedules/:id/<操作>`、走ったままの行を締める `POST /api/crawls/:id/failed` の 3 つの形です。
読むのは `GET /api/schedules` で、ほかの読み取りのエンドポイントと同じ素通しです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。本文が無い操作も `{}` を送ります。
- **中継するのは、この形ちょうどだけ。**
  操作は `pause`・`resume`・`run`・`repin`・`delete` の 5 つで、id は 16 進の数字とハイフンです。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。
- **消すのも POST です。** 中継の書き込みのエンドポイントは POST だけなので、capture-ledger のエンドポイントもその形にしてあります。
- 判断は capture-ledger がします。cron の式も頼みの中身も、断るのは capture-ledger です。ページは、句と理由の文が辞書に在れば画面の言語に訳し（`ledger.error.<句>`・`ledger.hint.<鍵>`）、無ければ届いたまま出します。

## POST /api/crawls/:id/inline/:name/fix —— その場の TS の直し方を訊く

これも書き込みのエンドポイントです。
型の検査で落ちたクロールを開き、型の誤りの在るその場の TS の「直し方を訊く」を押すと使います（[画面](/screens/)）。
本文は `{}` です。
capture-ledger が Claude に訊き、**クロールが落ちたのと同じ型の検査に通った直しだけ**を、理由・置き換えた行・往復の回数・費用つきで返します。
workbench は答えを描くだけです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。
- **中継するのは、この形ちょうどだけ。**
  id は 16 進の数字とハイフン、名前は小文字・数字・ハイフンで、`/fix` の後ろには何も付きません。
  `%` と `.` は通しません。
  `fetch` は URL の `..`（`%2e%2e` も）を畳むので、通すと capture-ledger のほかのエンドポイントに POST が届いてしまいます。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。

| capture-ledger の答え | いつ |
| --- | --- |
| 200 `{ rounds, source, edits, notes, compiled, usage }` | 検査に通った直しがある（`edits` は置き換えた範囲ごとの `before` と `after`、`usage.usd` は費用） |
| 409 `scripts compile` | いまの組み合わせが型を通る（直す物が無い） |
| 422 | クロールに必須の変数が足りない（`missing variables`。Claude は呼ばず、画面は値を渡して始め直すよう言う）、誤りがこの capture script に無い、2 往復で通らなかった（回数と費用つき）、Claude が断った |
| 429 `claude budget exhausted` | 組織がこの月の上限に届いた（`spentUsd` と `budgetUsd` つき）。Claude は呼ばない |
| 502・503 | Claude か ts-compile-service が答えなかった |
| 404 | 名乗りにクロールを始める許可が無い、クロールかその場の TS が無い、capture-ledger に API の鍵が無くエンドポイントごと無い |

## POST /api/archives/:id/changes/summary —— 2 本の差分を要約させる

これも書き込みのエンドポイントです。
[履歴](/screens/#履歴)で 2 本を選び、差分の下の「Claude に要約させる」を押すと使います。
`:id` が「今」の取り込みで、本文は `{ "since": "<前の取り込みの id>" }` です。
capture-ledger が、差分を読む `GET /api/archives/:id/changes` と同じ 2 本の差分を Claude に要約させ、差分の答えに要約（`summary` に model・決まりの文の版・費用。ほかに重さ・1 行・引用）を入れ、`reused` を足して返します。
workbench は答えを描くだけです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。
- **中継するのは、この形ちょうどだけ。**
  id は UUID の形で、`/summary` の後ろには何も付きません（query も）。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。
- **同じ差分には 2 度払いません。**
  同じ差分の要約が在れば、capture-ledger は Claude を呼ばずにそれを返します（`reused: true`）。
  差分を読む GET も、要約が在れば一緒に返すので、画面を開き直しても押し直さずに出ます。

| capture-ledger の答え | いつ |
| --- | --- |
| 200 | 要約できた、または前に作った要約が在った（差分の答えと同じ形に `reused`） |
| 404 | 名乗りにクロールを始める許可が無い、2 本のどちらかが無い・見てよくない（`{"error":"not found"}`）、capture-ledger に API の鍵が無くエンドポイントごと無い |
| 422 | 2 本の URL が違う（`different url`）、差分が無い（`nothing to summarize`）、「今」の取り込みがクロールに繋がらず、費用を数える組織が無い（`no organization`）、Claude が断った（`claude refused`） |
| 429 `claude budget exhausted` | 組織がこの月の上限に届いた（`spentUsd` と `budgetUsd` つき）。Claude は呼ばない |
| 502 | Claude が答えなかった（`claude failed`）、保管庫が答えなかった（`storage unreachable`） |

## POST /api/robots-exemptions —— robots.txt の例外を登録する・取り消す

これも書き込みのエンドポイントです。
robots.txt の例外の画面（[画面](/screens/)）が使います。
登録する `POST /api/robots-exemptions` と、取り消す `POST /api/robots-exemptions/:id/revoke` の 2 つの形です。
読むのは `GET /api/robots-exemptions` で、ほかの読み取りのエンドポイントと同じ素通しです。
capture-ledger のエンドポイントは v0.116.0 からです。

- 門とアクセストークンは `POST /api/crawls` と同じです（`Origin`・JSON・1 MiB）。本文の無い取り消しも `{}` を送ります。
- **中継するのは、この形ちょうどだけ。**
  番号は capture-ledger の連番で、1〜18 桁の数字だけを通します。`/revoke` の後ろには何も付きません（query も）。
  形は `src/lib.mjs` の `isWriteRoute` に在ります。
- **取り消すのも POST です。** 中継の書き込みのエンドポイントは POST だけなので、capture-ledger のエンドポイントもその形にしてあります。
- 登録の本文は `{ orgId, host, pathPattern?, scope, appliesTo?, userAgent, reason, expiresAt, dailyLimit?, linkLimit? }` です。
  `expiresAt` は offset つきの ISO 8601 で、workbench は選んだ日付の終わり（その端末の時刻の 23:59:59）を UTC の `…Z` で送ります。
  空の欄（path の型・上限）は送らず、capture-ledger の既定（`/`・100・20）になります。
- 判断は capture-ledger がします。workbench は欄を検査せず、誰が登録してよいかも見ません。
  ページは、断りの句が辞書に在れば画面の言語に訳し（`ledger.error.<句>`）、無ければ届いたまま出します。

| capture-ledger の答え | いつ |
| --- | --- |
| 201（登録）・200（取り消し） | 登録した行・取り消した行 |
| 400 `{ "error": "<句>", "field": "<欄>" }` | 登録の欄の字が決まりに合わない（最初の 1 つ。workbench は、名指された欄の下に文を出す）。本文の知らない鍵と型の違いは Fastify の定型の 400（`message`） |
| 403 | 組織の admin でない（`not an organization admin`）、機械の主体（`machine identities cannot manage robots exemptions`）、ヘッダで名乗る capture-ledger（`robots exemptions are not available with header identities`） |
| 404 `{"error":"not found"}` | 取り消す行が無い、または名乗りの組織の行でない |
| 409 | 登録: 同じ組織・ホスト・path の型で効いている行がもう在る（`id` つき）、同じホストの効いている行が別の User-Agent を使っている（`userAgent` つき）。取り消し: もう取り消してある、期限が過ぎている |

## /wacz/:id/… —— WACZ の中身を読む

WACZ（撮ったページを 1 つの ZIP にまとめたアーカイブ）を検証し、中を読むエンドポイントです。
中の WARC（撮った要求と応答を順に記録するファイル）や索引は、窓に分けて読みます。

| workbench が呼ぶ | daemon へ | 返すもの |
| --- | --- | --- |
| `POST /wacz/:id/validate?locale=&profile=` | `POST /validate` | 検証の報告（画面の言語で。profile は `spec` か `browserhive`。送らなければ daemon の既定の `spec`） |
| `GET /wacz/:id/lines?path=&from=&count=` | `POST /lines` | 行の窓 |
| `GET /wacz/:id/line?path=&n=` | `POST /line` | 1 行を丸ごとと、割った fields |
| `GET /wacz/:id/records?path=&from=&count=` | `POST /records` | WARC を頭から歩いたレコードの一覧 |
| `GET /wacz/:id/record?path=&offset=&length=` | `POST /record` | 1 レコード（WARC の見出し・HTTP・本文） |
| `GET /wacz/:id/record/body?path=&offset=&length=` | `POST /record/body` | 画像の実体。raster だけで、`nosniff` と `sandbox` つき。他は 415 |

この表は、`src/wacz.mjs` の `OPS` と突き合わされます（`npm run site:check`）。
エンドポイントを足すときは、`OPS` と `paramsFor` とこの表の 3 か所を直します。

- **どのエンドポイントも同じ 2 段。**
  capture-ledger の `POST /api/archives/:id/url` で署名をもらい、その URL を daemon に渡します（順番の意味は [WACZ を見る](/wacz/)）。
- **workbench が呼ぶのは GET、daemon へは POST。**
  `<img src>` も GET なので、画像の実体も GET で呼べるようにしてあります。
  検証だけは workbench からも POST です（押したときだけ走らせる）。
- daemon へ送る本文は `{ "source": { "kind": "uri", "uri": "<署名付き URL>" }, …引数 }` です。
  検証の引数は `locale` だけです（`ja` か `en`。画面の言語。query に無ければ `ja`）。
  ほかの値は 400 で断り、黙って別の言語には倒しません。

## 通すヘッダ

上流（capture-ledger か daemon）の答えから通すヘッダは allowlist で、`src/lib.mjs` の `PASS_HEADERS` が決めます（`content-type`・`content-length`・`x-content-type-options`・`content-security-policy`・`cache-control`）。
daemon の `date` や `connection` は、workbench の応答に混ぜません。
画像の実体（`/wacz/:id/record/body`）は bytes のまま、daemon が付けた印（`nosniff`・`sandbox`・`no-store`）ごと通します。
節目のスクリーンショット（`GET /api/archives/:id/screenshots/:stage`）も bytes のまま、capture-ledger が付けた印（`nosniff`・`sandbox`・`private, max-age=300, immutable`）ごと通します。
ほかの `/api/*` の答えから通すのは `content-type` だけです。

## 失敗の形

失敗は、何が居ないかを言います。
「見えない」と「立っていない」を混ぜません。

**workbench のサーバ自身の JSON の失敗は、文ではなく、句と値です**（`{"error":"<句>","params":{…}}`）。
句は `src/lib.mjs` の `ERROR_PHRASES` に在ります。
ページが、句を自分の言語の文にします（辞書の鍵は `workbench.error.<句>`。[開発](/development/#画面の文言)）。どう直すかの 1 文も、辞書の側に在ります。
capture-ledger が自分で書いた断りは、capture-ledger の本文のまま通します。ページは、それも同じ辞書で読みます（鍵は `ledger.error.<句>` と `ledger.hint.<鍵>`）。辞書に無い句と理由は、届いたまま出します。クロールの `error` は、辞書では読みません。言語を見る版の capture-ledger が、頼みの言語で返します（上記）。
ページを通らずにブラウザへ直に出る答え（`/login`・`/callback`・405 の text）は言語を選べないので、英語と日本語を並べて書いてあります（` / ` で区切るか、2 行に分ける）。

| 状態 | いつ | 本文 |
| --- | --- | --- |
| 400 | `/wacz/` のエンドポイントの引数が足りない、または数でない。検証の `locale` か `profile` が、画面の持たない物。capture-ledger へは行かない | `{"error":"parameter required","params":{"name":"from"}}`・`{"error":"unknown locale","params":{"locale":"fr"}}`・`{"error":"unknown profile","params":{"profile":"lenient"}}` |
| 400 | `/callback` の `state` を知らない・もう使った、または IdP が code をトークンに替えない | `Could not sign in / サインインできませんでした: …`（text） |
| 401 | セッションの無い `/api/*` と `/wacz/` のエンドポイント、または capture-ledger がトークンを断り、refresh token でも取れなかった | `{"error":"not signed in","params":{},"login":"/login"}` か `sign-in expired`。ページは `/login` へ移る |
| 403 | `Host` が workbench の host:port でない（どのエンドポイントも）。書き込みのエンドポイントでは、`Origin` が workbench でないときも | `{"error":"not the workbench host"}`・`{"error":"not from a workbench page"}` |
| 405 | method が違う。`/wacz/` のエンドポイント（検証は POST、他は GET）と、`/api/*`（GET だけ。書き込みのエンドポイントを除く） | `POST only / POST だけ`・`GET only … / GET だけ …`（`Allow` ヘッダつき） |
| 413 | 書き込みのエンドポイントの本文が 1 MiB を超えた | `{"error":"body too large","params":{"limit":1048576}}` |
| 415 | 書き込みのエンドポイントの `content-type` が JSON でない | `{"error":"json only"}` |
| capture-ledger のまま | capture-ledger が断った（見てよくない archive の 404 など） | capture-ledger の本文 |
| 502 | capture-ledger か daemon に届かない | `{"error":"ledger unreachable","params":{"url":"…","cause":"…"}}` か `validator unreachable`。直すコマンドは、辞書の文が言う |
| 502 | IdP に届かない、または IdP の discovery が失敗した | `{"error":"Cannot reach … / … に届かない (…)。…"}`。英語と日本語を並べ、直し方の 1 文つき |
| 503 | `WORKBENCH_OIDC_ISSUER` と `WORKBENCH_OIDC_CLIENT_ID` の無い `/login` | `Sign-in is not configured: …` と `サインインの設定が無い —— …`（text） |
| 404 | `public/` に無いファイル、または配らない拡張子 | `not found` |

答えを流している途中で上流が切れたら、頭はもう書けないので、接続を閉じます。
