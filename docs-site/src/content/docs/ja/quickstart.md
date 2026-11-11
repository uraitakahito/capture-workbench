---
title: クイックスタート
description: capture-workbench を起こす（ふだんは capture-ledger の dev:up が起こす）、サインインして許可を付ける、出た文から直す
---

## ふだんは dev:up が起こす

capture-workbench は、単体では何も見せません。
読む相手（台帳の API）と、サインインする IdP（Identity Provider。サインインするサービス）と、検証と WACZ の画面に答える daemon が要ります。
手元の IdP は [Floci](https://github.com/floci-io/floci)（Cognito を真似るもの）で、[capture-ledger](https://github.com/uraitakahito/capture-ledger)（どの URL を撮るかを決め、撮れたものを記録する台帳）の compose のサービス `idp` です。
それをまとめて起こすのが capture-ledger の `dev:up` で、workbench もその一部として、サインインの設定を渡されて起こされます。

```sh
cd ../capture-ledger
pnpm run dev:up       # 終わると workbench の URL を出す
open http://127.0.0.1:7080/
```

`dev:up` は、この repo が capture-ledger の隣（`../capture-workbench`）に在るものとして起こします。
別の場所に置いたなら `pnpm run dev:up --workbench <path>` です。
スタックの起こし方の全体は、capture-ledger の[クイックスタート](https://uraitakahito.github.io/capture-ledger/ja/quickstart/)に在ります。

| したいこと | capture-ledger で打つもの |
| --- | --- |
| workbench だけを起こし直す | `pnpm run dev:up --from workbench` |
| 何が立っているかを見る | `pnpm run dev:status` |
| 止める | `pnpm run dev:down`（ホストで動かしたものも止める） |

## workbench だけを直すとき

workbench を直すだけなら、この repo で起こします。
npm の依存を持たないので、install は要りません。
ただし、サインインの 2 つの設定が `.env` に要ります。
`.env.example` を写し、`WORKBENCH_OIDC_ISSUER` と `WORKBENCH_OIDC_CLIENT_ID` に、capture-ledger の `.dev/idp.env` の `IDP_ISSUER` と `IDP_WORKBENCH_CLIENT_ID` を書きます（[設定](/configuration/)）。

```sh
npm run dev           # http://127.0.0.1:7080/
```

台帳の API と Floci は立っている必要があります（`dev:up` が起こしたもので足ります）。
「検証」と WACZ の画面には daemon も要ります。
台帳のスタックを起こしたくなければ、[サンドボックス](/development/#サンドボックスで開く)で開けます。
`npm run sandbox` が、台帳の代役と本物の daemon をコンテナで起こし、workbench を 7081 で開きます。

`public/` の変更は、ブラウザを読み直すだけで効きます（サーバは要求のたびにディスクから読みます）。
`src/` を変えたら起こし直してください。
起こし直すとセッションが消えるので、サインインし直します。
`dev:up` が起こした workbench が 7080 を握っているなら、`npm run dev` はそう言って終わります（下の表）。
並べて動かすなら、ポート（待ち受けの番号）をずらします（`WORKBENCH_PORT=7081 npm run dev`）。
ただし、そのポートでは Floci でサインインできません。
IdP が知っている戻り先は 7080 の物だけで、Floci はサインインを 400
`redirect_uri is not registered for this client` で断ります（[設定](/configuration/#サインイン)）。

## サインインして、許可を付ける

workbench を開くと、Floci のサインインの画面へ回ります。
capture-ledger の `.dev/idp.env` に在る利用者とパスワード（`IDP_USER` と `IDP_USER_PASSWORD`）を打ちます。
workbench に戻ると、画面の上に `<利用者> (<組織>) としてサインインしています` と「サインアウト」のリンクが出ます。

その利用者に、組織のクロールの許可が要ります。

```sh
cd ../capture-ledger
pnpm run idp:grant    # 1 度だけ
```

許可は名前ではなく、利用者の `sub`（Floci が付けた ID）に付きます。
`dev:up` はこれを `grant` の段でするので、capture-ledger のクイックスタートをたどったなら、そこで済んでいます。
許可が無いと、画面の上に赤で `not found` と出て、一覧は空のままです。
台帳は、許可の無い名乗りにクロールの一覧を空で返し、スクリプトには 404 を返します。
workbench はその 404 を受けて、一覧を描かずに止まります。

## 出た文から直す

| どこに | 出る文 | 直し方 |
| --- | --- | --- |
| 画面の上（赤） | `not found` | 名乗りに許可が無い。上の `idp:grant` |
| `/login` | `サインインの設定が無い —— WORKBENCH_OIDC_ISSUER と WORKBENCH_OIDC_CLIENT_ID を書く …` | サインインの設定なしで起こした。設定を書く（[設定](/configuration/)）か、`dev:up` に起こさせる |
| `/login`・画面の上（赤） | `… に届かない (…)。capture-ledger で pnpm run dev:status の IdP の行を見る` | Floci が答えない。`dev:status` の IdP の行を見る |
| `/login`・画面の上（赤） | `… の discovery が … —— Floci のプールが作り直されたなら、capture-ledger で pnpm run dev:up --from idp` | Floci は答えるが、この issuer には答えない。プールが作り直された。言われたとおりに打つ |
| `/callback` | `サインインできませんでした: 知らない state —— サインインをやり直す (/login)` | サインインに時間が掛かりすぎた、2 度使った（戻るボタン）、途中で workbench を起こし直した。`/login` を開き直す |
| `/callback` | `サインインできませんでした: code をトークンに替えられない: …` | IdP が code を断った。コロンの後が IdP の答え。`/login` を開き直す |
| 画面の上（赤） | `… に届かない (…)。capture-ledger で pnpm run api は動いているか?` | 台帳の API が立っていない。`dev:up` で起こす |
| 検証の欄・WACZ の画面 | `… に届かない (…)。capture-ledger で pnpm run dev:up --from validator は済んでいるか?` | daemon が立っていない。言われたとおりに打つ |
| 名乗りの欄 | `サインインしていません` | セッションが無い。出たままなら、サインインの設定が無い。`/login` が足りない物を言う |
| 名乗りの欄 | `workbench 自身に届きません` | workbench のサーバが止まっている。起こし直す |
| 足元 | `取りに行けませんでした（上の表は最後に描けたもの）` | 理由は画面の上の赤い文。表は最後に描けたものを残している |
| スクリプト集の画面（赤） | `台帳にスクリプトがありません。…` | 走らせるスクリプトが台帳に無い。赤い文の中のコマンドで取り込む |
| 新しいクロールの画面の「始める」の下 | `404 —— not found` | 名乗りにクロールを始める許可が無い。上の `idp:grant` |
| 新しいクロールの画面の「始める」の下 | `404 —— Route POST:/api/crawls not found` | 台帳がクロールの投げ先（Windmill）を知らない。`dev:up` のスタックなら在る |
| クロールの画面（移る） | 走行中の行に印 | 409。走っているのは全体で 1 本まで。印の付いた行が終わるのを待つ |
| 端末 | `127.0.0.1:7080 は、既に動いている workbench です (pid …)。` | 開くだけでよい。起こし直すなら `pnpm run dev:up --from workbench` |
| 端末 | `127.0.0.1:7080 は別のものが握っています …` | `pnpm run dev:status` で正体を見て、`pnpm run dev:down` で片付ける |

workbench は、失敗しても表を消しません。
空の表は「見えるものが無い」と読めてしまい、「取りに行けない」と区別が付かないからです。
