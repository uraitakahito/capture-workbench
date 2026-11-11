---
title: 設定
description: capture-ledger の dev:up の下なら .env は要らない。変えるのは「どの IdP でサインインするか」と「どこを見るか」だけ —— 環境変数の表と、読む順
---

## dev:up の下なら .env は要らない

capture-ledger の `pnpm run dev:up` が workbench を起こすときは、サインインの 2 行（`WORKBENCH_OIDC_ISSUER` と `WORKBENCH_OIDC_CLIENT_ID`）を `dev:up` が渡し、残りは既定値で動きます。
`.env.example` の行は全部コメントです。
写すのは、手で起こすときか、「どこを見るか」を変えるときだけです。

```sh
cp -n .env.example .env    # 要る行のコメントを外す
```

[capture-ledger](https://github.com/uraitakahito/capture-ledger)（クロールを始め、撮れたものを記録する台帳）は、OpenFGA（認可のサービス）の id のように「走らせてみないと決まらない値」を必須で持ちます。
workbench にも、そういう値が 2 つあります。
IdP（Identity Provider。サインインするサービス）の issuer と、そこでの workbench の app client の ID です。
手元の IdP は [Floci](https://github.com/floci-io/floci)（Cognito を真似るもの）で、プールの ID が issuer に入り、プールを作り直すたびに替わります。
だからどちらにも既定値がありません。
`dev:up` は capture-ledger の `.dev/idp.env`（`IDP_ISSUER` と `IDP_WORKBENCH_CLIENT_ID`）から読んで渡します。
手で起こすなら、その 2 つの値を `.env` に写します。
ほかの宛先は loopback の決め打ちで足ります。
秘密は 1 つもありません。

## 環境変数

| 名前 | 既定値 | 何を決めるか |
| --- | --- | --- |
| `WORKBENCH_PORT` | `7080` | capture-workbench の待受。loopback（`127.0.0.1`）にだけ bind する |
| `WORKBENCH_LEDGER_URL` | `http://127.0.0.1:7070` | 台帳の API |
| `WORKBENCH_OIDC_ISSUER` | 無い | IdP の issuer（`iss`）。手元は capture-ledger の `.dev/idp.env` の `IDP_ISSUER` |
| `WORKBENCH_OIDC_CLIENT_ID` | 無い | IdP での workbench の app client の ID。手元は同じファイルの `IDP_WORKBENCH_CLIENT_ID` |
| `WORKBENCH_REPLAYWEB_SERVER_URL` | `http://127.0.0.1:8899` | 「replay ↗」の行き先。アーカイブの行と検索の当たりは WACZ 1 本を、クロールの行とページの行はクロールの合本を開く |
| `WORKBENCH_WINDMILL_URL` | `http://127.0.0.1:8000` | クロールの行の「run ↗」の行き先 |
| `WORKBENCH_WINDMILL_WORKSPACE` | `crawler` | 「run ↗」が開く Windmill の workspace |
| `WORKBENCH_VALIDATOR_URL` | `http://127.0.0.1:7180` | 検証と WACZ の画面に答える [wacz-validator](https://github.com/uraitakahito/wacz-validator)（WACZ を規則ごとに検証する検証器）の daemon |

この表は、`src/server.mjs` と `.env.example` と突き合わされます（`npm run site:check`）。
変数を足すときは、3 か所とも直します。

### サインイン

人は IdP のサインインの画面を通り、workbench は戻ってきた code をアクセストークンに替えます（authorization code と PKCE。PKCE は Proof Key for Code Exchange）。
本番の IdP は Amazon Cognito で、手元は capture-ledger の compose のサービス `idp` の Floci です。
Floci の準備は capture-ledger の `pnpm run idp:bootstrap` がします。
エンドポイントは[エンドポイント](/routes/)に在ります。

- **app client は public。**
  secret を持ちません。
  よそに code を拾われても、PKCE がトークンに替えさせません。
- **トークンは、サーバのメモリにだけ在る。**
  ブラウザが受け取るのは、セッションの ID を入れた HttpOnly の cookie（`workbench_session`）だけです。
  workbench を起こし直すとセッションは全部消え、次の要求でサインインの画面へ回ります。
- **戻り先は、IdP に登録した物と一字一句同じでなければならない。**
  戻り先は `http://127.0.0.1:<WORKBENCH_PORT>/callback` です。
  `idp:bootstrap` が登録するのは 7080 の物なので、ほかのポートでは Floci のサインインから戻ってきません。
- **手元のサインインは便利さで、守りではない。**
  Floci の管理の API は既定の鍵を通すので、Floci に届くものは利用者を作り、その利用者としてサインインできます（capture-ledger の[開発環境](https://uraitakahito.github.io/capture-ledger/ja/development-environment/)）。
  workbench を loopback の外に出さない理由の 1 つです。

### 行き先は、workbench が組み立てない

replayweb-server と Windmill の行き先は、配備の事実です。
台帳が返すのは `objectKey`・クロールの合本の鍵・run の id だけなので、どこで開くかはサーバが 1 か所で決め、`/healthz` でブラウザの側に配ります（[エンドポイント](/routes/)）。

どの「replay ↗」も、保管庫の URL ではなく、replay と同じ origin の path を渡します。
`?source=` の値は `/wacz/` と鍵で、鍵は `/` で区切って区切りごとに百分率の符号にし、その path をもう 1 度 query の値として符号にします。
replayweb-server（v0.3.0 から）は区切りごとに 1 度だけ解くので、`%` を含む鍵（BrowserHive はラベルを百分率の符号で鍵に入れます）も、そのまま保管庫に届きます。
決まりは `public/replayweb.js` の `replaywebSourceHref` で、WACZ 1 本もクロールの合本も同じです。

クロールの合本を開くには、合本のページの問い（`/q/…`）にも答える replayweb-server が要ります。
ReplayWeb.page は合本の WACZ とページの一覧を、自分と同じ origin の path から引きます。

## 読む順

`npm run dev` は、`.env`・`.env.local` の順に読みます（在れば。無くても止まりません）。

- 同じ名前が両方に在れば、後から読む `.env.local` が勝ちます。
- 端末で渡した変数は、どちらのファイルよりも勝ちます。
  `WORKBENCH_PORT=7081 npm run dev` のように、その場だけ変えられます。

## 空は「無い」と同じ

`NAME=` と値を書かずに置くと、既定値になります（POSIX の `${VAR:-word}` と同じ側）。
[Web Capture](https://uraitakahito.github.io/capture-ledger/ja/#web-capture) の他の repo と同じ意味に揃えてあります。
値を書かないなら、行ごとコメントにしてください。

## 7080 であって 7000 ではない

macOS の ControlCenter（AirPlay Receiver）が `*:7000` を握っています。
`127.0.0.1:7000` に bind できてしまうので気づきにくいのですが、`localhost:7000` が `::1` へ解決されると AirPlay に当たります。
port から持ち主を引く道具（capture-ledger の `dev:status`・`dev:down`）も、毎回「別のものが握っている」と言うことになります。
だから台帳（7070）の隣の 7080 を取っています。
