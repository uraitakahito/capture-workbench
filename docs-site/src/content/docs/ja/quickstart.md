---
title: クイックスタート
description: capture-workbench を起こす（ふだんは capture-ledger の dev:up が起こす）、サインインして許可を付ける、出た文から直す
---

## ふだんは dev:up が起こす

capture-workbench は、単体では何も見せません。
読む相手（capture-ledger の API）と、サインインする IdP（Identity Provider。サインインするサービス）と、検証と WACZ の画面に答える daemon が要ります。
手元の IdP は [Floci](https://github.com/floci-io/floci)（Cognito を真似るもの）で、[capture-ledger](https://github.com/uraitakahito/capture-ledger)（どの URL を撮るかを決め、撮れたものを記録するシステム）の compose のサービス `idp` です。
それをまとめて起こすのが capture-ledger の `dev:up` で、workbench もその一部として、サインインの設定を渡されて起こされます。

```sh
cd ../capture-ledger
pnpm run dev:up       # 終わると workbench の URL を出す
open http://127.0.0.1:7080/
```

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

capture-ledger の API と Floci は立っている必要があります（`dev:up` が起こしたもので足ります）。
「検証」と WACZ の画面には daemon も要ります。
capture-ledger のスタックを起こしたくなければ、[サンドボックス](/development/#サンドボックスで開く)で開けます。
`npm run sandbox` が、capture-ledger の代役と本物の daemon をコンテナで起こし、workbench を 7081 で開きます。

## サインインして、許可を付ける

workbench を開くと、Floci のサインインの画面へ回ります。
capture-ledger の `.dev/idp.env` に在る利用者とパスワード（`IDP_USER` と `IDP_USER_PASSWORD`）を打ちます。
workbench に戻ると、画面の上に `<利用者> (<組織>) としてサインインしています` と「サインアウト」のリンクが出ます。
「サインアウト」を押すと、workbench と IdP の両方から出て、Floci のサインインの画面に着きます（別の利用者でサインインし直せます）。

その利用者に、組織のクロールの許可が要ります。

```sh
cd ../capture-ledger
pnpm run idp:grant    # 1 度だけ
```

許可は名前ではなく、利用者の `sub`（Floci が付けた ID）に付きます。
`dev:up` はこれを `grant` の段でするので、capture-ledger のクイックスタートをたどったなら、そこで済んでいます。
許可が無いと、画面の上に赤で `見つかりません` と出て、一覧は空のままです。
capture-ledger は、許可の無い名乗りにクロールの一覧を空で返し、capture scripts には 404 を返します。
workbench はその 404 を受けて、一覧を描かずに止まります。
