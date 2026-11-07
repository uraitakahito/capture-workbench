---
title: 設定
description: .env は要らない。変えるのは「誰として見るか」と「どこを見るか」だけ —— 環境変数の表と、読む順
---

## .env は要らない

既定値だけで動きます。
`.env.example` の行は全部コメントで、生きた行が 1 つもありません。
写すのは、「誰として見るか」か「どこを見るか」を変えるときだけです。

```sh
cp -n .env.example .env    # 要る行のコメントを外す
```

[capture-ledger](https://github.com/uraitakahito/capture-ledger)（クロールを始め、撮れたものを記録する台帳）と違うのは、ここには既定値を持てない値が 1 つも無いからです。
capture-ledger は、OpenFGA（認可のサービス）の id のように「走らせてみないと決まらない値」を必須で持つので、`.env` が要ります。
こちらが持つのは名乗り（誰として見るか）と宛先だけで、アクセストークンは要るときに issuer から取得し、宛先は loopback の決め打ちで足ります。
秘密は 1 つもありません。

## 環境変数

| 名前 | 既定値 | 何を決めるか |
| --- | --- | --- |
| `WORKBENCH_PORT` | `7080` | capture-workbench の待受。loopback（`127.0.0.1`）にだけ bind する |
| `WORKBENCH_LEDGER_URL` | `http://127.0.0.1:7070` | 台帳の API |
| `WORKBENCH_ISSUER_URL` | `http://127.0.0.1:9099` | 開発用 issuer。capture-ledger の `pnpm run oidc:issuer` が立てるもの |
| `WORKBENCH_SUBJECT` | この機械のユーザー名 | 誰として見るか。この名前に許可が要る（[クイックスタート](/quickstart/)） |
| `WORKBENCH_ORGANIZATIONS` | `acme` | 名乗る組織（カンマ区切り） |
| `WORKBENCH_REPLAYWEB_SERVER_URL` | `http://127.0.0.1:8899` | 「replay ↗」の行き先。アーカイブの行と検索の当たりは WACZ 1 本を、クロールの行とページの行はクロールの合本を開く |
| `WORKBENCH_WINDMILL_URL` | `http://127.0.0.1:8000` | クロールの行の「run ↗」の行き先 |
| `WORKBENCH_WINDMILL_WORKSPACE` | `crawler` | 「run ↗」が開く Windmill の workspace |
| `WORKBENCH_VALIDATOR_URL` | `http://127.0.0.1:7180` | 検証と WACZ の画面に答える [wacz-validator](https://github.com/uraitakahito/wacz-validator)（WACZ を規則ごとに検証する検証器）の daemon |

この表は、`src/server.mjs` と `.env.example` と突き合わされます（`npm run site:check`）。
変数を足すときは、3 か所とも直します。

### 名乗りは便利さで、守りではない

workbench は `WORKBENCH_SUBJECT` と `WORKBENCH_ORGANIZATIONS` の名前で、開発用 issuer の `POST /token` からアクセストークンを取得します。
開発用 issuer は、頼まれれば誰の名前でも出します。
ここで名前を変えれば、その名前として見えるものが見えます。
だから workbench は境界ではなく、loopback の外に出しません。

### 行き先は、workbench が組み立てない

replayweb-server と Windmill の行き先は、配備の事実です。
台帳が返すのは `objectKey`・クロールの合本の鍵・run の id だけなので、どこで開くかはサーバが 1 か所で決め、`/healthz` でブラウザの側に配ります（[中継の口](/routes/)）。

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
