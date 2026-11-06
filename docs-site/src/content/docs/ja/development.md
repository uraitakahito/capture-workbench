---
title: 開発
description: 依存の線、検査と試験が見るもの・見ないもの、サンドボックスで開く、docs を直す、画面の絵を撮り直す、リリース
---

## 依存の線

**dashboard（repo の根）は npm の依存を持ちません。**
在るのは node の http サーバ 1 本と、ブラウザで素のまま走る JS だけです。
framework は通さないので、dashboard のためには install も lockfile も audit も要りません（[capture-scripts](https://github.com/uraitakahito/capture-scripts) と同じ判断）。
分割したくなるほど育ったら、そのとき入れます。
**例外は `public/vendor/shiki.js` の 1 ファイルです。**
スクリプトの色付けを 1 ファイルに束ねて commit した物で（[同梱した色付け](#同梱した色付け)）、dashboard はそれを読むだけなので、install は今も要りません。

依存が在るのは 2 つで、どちらも npm の別 project にしてあります。
`docs-site/`（このサイトの原稿。Astro + Starlight と、画面の絵を撮る道具）と、`highlighter/`（`public/vendor/shiki.js` を作る元）です。
lockfile も audit も Dependabot もそこに閉じ、root に `node_modules` を作りません。

| 打つもの | 何をするか |
| --- | --- |
| `npm run dev` | 画面（`public/`）を配り、`/api/*` を台帳へ、`/wacz/*` を daemon へ中継する |
| `npm run check` | push の前に走らせる、dashboard の検査の全部。中身と並びは `package.json` の `check`（CI の `ci.yml` が走らせるのも同じ） |
| `npm run site:check` | docs を build し、docs と repo のずれを見る（先に `npm ci --prefix docs-site`） |
| `npm run vendor` | `highlighter/` の lockfile から `public/vendor/`（束と、束ねた物の license の本文）を作り直す |
| `npm run vendor:check` | 作り直して、commit した物と 1 バイトでも違えば落ちる（CI の `vendor.yml` が走らせる） |

root の script は `pnpm run` で打っても同じです（[capture-ledger](https://github.com/uraitakahito/capture-ledger) の `dev:up` は、dashboard を `pnpm run dev` で起こします）。
`check` に `site:check` は入れていません。
`check` が install なしで走ることも、dashboard の性質の一部だからです。

## 同梱した色付け

スクリプト集の画面は、`public/vendor/shiki.js` で source に色を付けます。
[Shiki](https://shiki.style) を、TypeScript の文法と 2 つの配色（GitHub Light High Contrast と GitHub Dark Default）だけにして、esbuild で束ねた物です（何を入れるかは `highlighter/entry.mjs`）。
束は詰めてあるので、差分を読んでレビューできません。
読むのは lockfile と `highlighter/build.mjs` にして、束がそこから作った物どおりかは `vendor.yml` に見させます。

- **`public/vendor/` を手で直さない。**
  書くのは `npm run vendor` です。Shiki の版を上げたら走らせます。
- **`highlighter/` への Dependabot の PR は、`package.json` と lockfile しか変えない。**
  なので `vendor.yml` が赤になります。その枝で `npm run vendor` を走らせ、作り直した物を commit してから入れます。
- **束ねる物に MIT 以外が混ざると、作り直しが止まる**（`highlighter/build.mjs`）。そのときは何も書きません。
  束ねた物の license の本文は `public/vendor/shiki.LICENSES.txt` に在ります。
- **色は、画面の地に対して測る。**
  `test/highlight.test.mjs` が `public/app.css` の `--ground` を読み、スクリプトのファイルで使う色が明暗とも 4.5:1 以上かを見ます。地や配色を替えれば、測り直しになります。
- **`npm run check` は `innerHTML` の語を、`public/` の下の `.js` の全部で探す。** 束も含みます。
  `.html` のファイルと、ほかの API（`insertAdjacentHTML` など）は見ません。
- **色付けは worker で走る**（`public/highlight-worker.js`）。
  Shiki は最初の 1 本で文法を組むので、画面を描く thread で走らせると 100 ms を優に超えて止まります。
  色は描いてある行に、1 コマに数 ms ずつ塗ります。

## 試験が見るもの、見ないもの

試験（`test/`、`node --test`）が見るのは、外と話さない部分だけです。
経路の読み、引数の組み替え、署名が外に出ないこと、状態と数の描き方などです。
そういう部分は、試験から直接呼べるように `src/wacz.mjs` や `public/format.js` のようなファイルに切り出してあります。
`public/` のものは、ブラウザが読むのと同じファイルを試験も読むので、写しが腐りません。

**中継と名乗りは、CI では見ません。**
台帳と issuer が立っていないと確かめられないので、証拠は手で当てて PR に貼ります。

## サンドボックスで開く

台帳のスタックを起こさずに、dashboard を全部の状態で開く手です。
相手（台帳の代役と、本物の検証の daemon）はコンテナで、dashboard は host で動きます。

1. この repo の隣（`../wacz-validator`）に [wacz-validator](https://github.com/uraitakahito/wacz-validator) を置く。
   daemon の image は、その Dockerfile の daemon の段から建てます。
2. 起こして、開く。

   ```sh
   npm run sandbox       # 初回は daemon の image を建ててから起こす
   open http://127.0.0.1:7081/
   ```

3. 片付ける。
   dashboard は Ctrl-C で止まり、コンテナは `npm run sandbox:down` で止まります。

口は `dev:up` が起こすものとずらしてあるので、並べて動かせます（口は `sandbox/sandbox.env`）。
dashboard が読む設定は `sandbox/sandbox.env` だけで、あなたの `.env` は読みません。
コンテナの組み立ては、`docker-compose.yml` の頭に書いてあります。

何を見せるかは、台本（`sandbox/scenario.json`）と標本の WACZ（撮ったページをまとめたアーカイブ。`sandbox/samples/`）が決めます。
標本は、検証の結論が分かっている corpus から写したものです。
出どころと、それぞれが受けるはずの結論は `sandbox/samples/SOURCE.md` に在ります。

| したいこと | すること |
| --- | --- |
| 見せるものを変える | 台本を書き換える。代役は要求のたびに読むので、起こし直さずに画面に出る |
| 台帳にスクリプトが無いときを見る | 台本の `"emptyCatalog"` を `true` にする。スクリプト集の画面には受け皿の型だけが残る |
| スクリプトを変える | 台本の `catalog` を書き換える。1 版に 1 つで、id の現れる順が既定の実行順。`sandbox/catalog/` のファイル（capture-scripts v0.11.1 のスクリプトと受け皿の型の写し）を名指す。`sha256` と `bytes` は代役が台帳と同じくファイルから数え、一覧は各 id に 1 行（有効な版の中の最新、無ければ最新版を `enabled: false` で）。autoscroll v2 は同じファイルで `options` だけが違う版。autofetch は `enabled: false` —— カタログに `"default": false` と書いたスクリプトを台帳が持つ姿で、名指したときだけ走る。`sites`（対象サイト）のある版はサイト用のスクリプトで、既定で走るのは起点のどれかが対象サイトのホストにあるときだけ。`egov-law-search`（対象サイト `laws.e-gov.go.jp`）も capture-scripts の写しで、本物の台帳と同じ版。版の `params` は宣言（capture-scripts の `catalog.json` の `params`）で、一覧と 1 版の口に出る —— `egov-law-search` は変数 `query` を宣言する。`hostTypes` は受け皿の型で、消すと型を取り込んでいない台帳になる。写しは `check:terms` から外してある（別の repo の言葉で、直すと行番号が実物とずれる） |
| 別の WACZ を並べる | `SANDBOX_WACZ_DIR=<dir> npm run sandbox`（相対なら、この repo から。例: `../wacz-validator/samples`）。代役と daemon の両方に同じ置き場が入る |
| wacz-validator の更新を daemon に入れる | `npm run sandbox:build`。`npm run sandbox` は、image が無いときにしか建てない |
| 新しいクロールの画面を試す | 新しいクロールの画面から始める。代役は受けた行を台本の `submit.runsSeconds` 秒だけ走らせてから完走にする。走っている間にもう 1 度押すと 409、読めない URL は 400。走らせるもの（スクリプトのチェックとその場の TS）も台帳と同じ形で受け、知らないスクリプトの id・同じ id の重ね・名前の綴り・起点に合わないサイト用のスクリプトの名指し・既定が空（台帳にスクリプトが無いか、全部が別のサイト用）は台帳と同じ文で 400。台帳の schema に無い鍵も台帳と同じ文（`body must NOT have additional properties`）で 400。行を開くと走らせたものが出る。チェックの横の「読む」は右の列に開く（代役の autoscroll は v2 で設定つき、egov-law-search は起点に laws.e-gov.go.jp が無いと押せないが読める） |
| クロールごとの値を試す | 起点に `https://laws.e-gov.go.jp/` を書いて egov-law-search を選ぶと、必須の変数 `query` の欄が出る。書いた値は `variables` で送られ、行を開くと「渡した値」に出る。その場の TS に `defineParams` を書いても欄が出る —— 代役は `POST /api/scripts/check` に、source を正規表現で読んで答える（代役だけの近道で、本物は ts-compile-service が構文木を歩く。型を検査しないので、`diagnostics` は `BH0002` と `BH0004` だけ）。代役は台帳 v0.80.0 と同じ順と文で 400 を言う —— 必須の変数が無い（`missing variables`。ほかの値の誤りより先）・同じ名前を別の種類か別の形で宣言している（`conflicting params`）・シークレットの名前を変数で渡している（`secrets cannot be passed as variables`）・どのスクリプトも宣言していない変数（`unknown variables`）・宣言の形に合わない値（`invalid variables`。理由は `hint`）・宣言した必須のシークレットが Windmill に無い（`unknown secrets`。名前と path と `hint`）・在るが secret でない（`not a secret variable`）。その場の TS の宣言の形は台帳の schema と同じ文で、`inline.params` に書けるのはシークレットだけ。変数を書くか、同じ名前が 2 度あれば `invalid params`。Windmill の代わりは台本の `windmillSecrets`（在る secret 変数の名前）と `windmillVariables`（在るが secret でない名前）。シークレットの宣言は、その場の TS の `inline.params` を台帳の API に直に送るときだけ試せる（画面には欄が無い）。台本のクロール `5b0c0007` は変数 `query` とシークレット `api_token` を持ち、開いた行に「渡した値」と「使ったシークレット」が出る。値は代役もどこにも書かない |
| User-Agent の箱を試す | 新しいクロールの画面で「Headless を外す型を入れる」を押すか、字を打つ。代役は字の形を台帳と同じ文で断り、受けた字を開いた行に出す |
| 規則を試す | 新しいクロールの画面で「リンクを辿る」を選ぶ。代役は台帳 v0.62.0 と同じく規則を確かめる（同じ 3 つの 400 を同じ文で、`/api/crawl-rules/check` も同じ答え）し、`/api/crawls/:id/decisions` にも答える。台本のクロール `5b0c0007` は `rules`・`decisions`・`robots` を持ち、1 度も当たらない規則が 1 本ある。**`same-site` は近似**: 代役は Public Suffix List を持たず、ホスト名の最後の 2 ラベルをサイトとする。だから `example.co.jp` と `other.co.jp` を同じサイトと読む（台帳は tldts で、そう読まない） |
| ページとログを見る | 台本のクロールに `pages` を書く（ページの行と、BrowserHive の答えの形の `log`。`counts` は省けば行から数える）。代役は台帳の `/api/crawls/:id/pages`（`after` と `limit`。続きは本文の `next`）と `/api/crawls/:id/pages/:page/log` に答え、`failures` の要素に `page` を付ける。`after` が数字だけでない・`limit` が範囲の外なら 400。`log` の無いページは、ログを読めない理由を返す（台本の `logReason`。省けば taskId の無いページは `not-captured`、在れば `no-log`）。台本のクロール `5b0c0009` は、時間切れのページ（warn と error の行）・捨てた行と途中で切った行を持つページ・robots.txt で撮らなかったページを持つ。`pages` の無い行は一覧が空。「続きを読む」を見るなら、行に台帳の 1 回分より多いページを書く（代役の 1 回分は台帳と同じ既定で、`sandbox/fake-ledger.mjs` の `pageList` に在る） |
| 走らせたものの在る行を見る | 台本のクロールに `scripts` を書く（その場の物は `inline` つき）。同梱の台本には、その場の TS で完走した行と、compile の段で落ちた行が在る。代役も台帳と同じく、1 本の詳しい所には source を載せず、「欄に戻す」は名前の口（`/api/crawls/:id/inline/:name`）から取る。クロール `5b0c0008` の autoscroll の `sha256` はわざと台帳の v1 と違えてあり、版の番号が使い回されたときに、クロールの「読む」が出す知らせを見られる |
| 検索を試す | 検索の画面で語を打つ（同梱の台本では「ランプ」で 2 件）。代役は台本の `searchPages`（アーカイブごとのページ一覧の行。`stage` の無い行が文書の行）から、台帳と同じ決まりで答える —— 写しの行が在るアーカイブでは写しの行だけを引き、`hidden` のアーカイブは出さない。**代役は OpenSearch を持たない**: 題か本文に語を含む行を拾うだけで、点数も分かち書きも無い。`q` が無い・空・ほかの欄があれば、台帳の schema と同じ文で 400 |
| クロールの合本を見る | 台本のクロール `5b0c0009` を開く。行の run ↗ の隣に replay ↗ が出て、ページの表では撮れたページの結末の後ろに replay ↗ が付く（行の `replayBundle` は r2、ページの `bundledRev` は 1 と 2）。時間切れのページと robots.txt で撮らなかったページには付かない。`5b0c0003` は r2 の次の版を書けなかった行（replay ↗ は r2 を開き、開いた行が理由を言う）、`5b0c0002` は 1 度も書けなかった行（replay ↗ が出ず、開いた行が理由を言う）。台本の行に `replayBundle`（`rev`・`pages`・`builtAt`・`error`。失敗だけの行は `rev` を省く）を、ページに `capturedAt` と `bundledRev` を書く。鍵は代役が台帳と同じ形（`org/<orgId>/crawls/<crawlId>/r<rev>/replay.json`）に組む。**代役は合本を書かない** —— replay ↗ の先には何も無い |
| 直し方を訊く | クロール `5b0c0008`（型の検査で落ちた行）を開く。代役は `/api/crawls/:id/diagnostics` に台本の行の `diagnosed`（台帳の答えそのまま。無い行は型を通る答え）で、`POST /api/crawls/:id/inline/:name/fix` に `fixes`（その場の TS の名前ごとの `{ status, body }`）で答える。**代役は Claude を呼ばない** —— `fixes` に無い名前は 404。`5b0c0008` は TS7006 の 1 件と、検査に通った直し（2〜3 行目。直した版は TypeScript 6.0.3 の strict で通る）を持つ。ほかの答えを見るなら、`fixes` に 429 や 422 の `status` と台帳の本文を書く |

代役にできないこともあります。

- **認可を真似ない。**
  名乗りは何でも通るので、許可が無いときの画面はここでは出ません。
- **replay ↗ と run ↗ の飛び先は、サンドボックスの外です。**
  開いても、代役の行（と合本）は向こうに在りません。
- 検証の報告の版は `wacz-validator unknown` と出ます（image に `.git` を入れないため）。
- 画面の赤い文は、直し方に capture-ledger のコマンドを挙げます。
  サンドボックスでは、台帳は代役、daemon は `sandbox-validator` のコンテナと読み替えてください。
- 代役の答えの形は、台帳のコードから写したものです。
  台帳が欄を変えても、代役はついてきません（写した欄の集合は `test/sandbox.test.mjs` が固定しています）。
  本物との突き合わせは、`dev:up` のスタックでします。

headless Chrome の `--dump-dom` で読もうとすると、終わりません。
dashboard が一覧を引き続けるからです（止めたときには DOM は出ています）。
自動で押すなら puppeteer のような、ページを操作する道具を使います。

## docs を直す

```sh
npm ci --prefix docs-site   # 1 度だけ
npm run site:dev            # その場で見る
npm run site:check          # push の前に
```

- **`astro build` は守りにならない。**
  `.md` のページは、描画の中で何が落ちても Starlight が握り潰して終了コード 0 になります。
  だから `site:check` は build と `scripts/check-doc-refs.mjs` を一緒に走らせ、CI（`site.yml`）も同じものを走らせます。
  何を見ているかは、そのファイルの冒頭に書いてあります。
- **図（mermaid）は、ブラウザで見る。**
  図はブラウザの側で描くので、構文を間違えても build は通ります。
  図を変えたら `npm run site:dev` で開いて、図が描けていて「Syntax error」が出ていないことを見ます。
  build したものを見るなら `npm run site:build && npm run site:preview` です。
  preview は裏に回って `http://localhost:4321/dashboard/` で配り続けるので、見終えたら `cd docs-site && npx astro preview stop` で止めます。
- **en と ja は同じ PR で直す。**
  対の検査が比べるのはファイル名だけで、中身は見ません。
  逐語訳でなくてよく、同じ事実をそれぞれの言葉で書きます。
- **本文のリンクは `[x](/page/)` と書く。**
  base（`/dashboard`）と `/ja` は `docs-site/src/plugins/hast-rebase-links.ts` が付けます。
  frontmatter の中のリンクだけはそこを通らないので、`/dashboard/…` と書きます。
- **日本語は、句読点の後で改行する。**
  文の途中で改行すると、表示で字の間に空白が出ます。
- **「名乗り」は、誰として見るかにだけ使う。**
  issuer が返す物はアクセストークンと書きます（英語版は access token）。
  2 つを混ぜた形は、`npm run check` の中の `scripts/check-terms.mjs` が見張ります。

## 画面の絵を撮り直す

[画面](/screens/)のページの絵は、`npm run docs:shots`（`docs-site/scripts/docs-shots.mjs`）が[サンドボックス](#サンドボックスで開く)を相手に撮った物です。
手で撮った絵は置きません。
CI では撮りません（代役のコンテナが要るので）。
撮るのは手元で、CI は撮った物を見張ります。

```sh
npm ci --prefix docs-site            # 1 度だけ（撮る道具は docs-site の依存）
npm run sandbox                      # 別の端末で。7081 が答えるまで待つ
npm run docs:shots                   # 全部。画素が前と同じ絵は書かない
npm run docs:shots -- start crawls   # 名指した絵だけ
```

- **dashboard を変えたら、撮り直してから PR にする。**
  dashboard（`public/`。束ねた色付けの `public/vendor/` も）、代役（`sandbox/`）、撮る道具のどれかを変えると、`site:check` が「絵の元が、撮ったときと違う」で落ちます。
  全部を撮り直すと、`shots.json` の控え（`source`）が今の中身の sha256 になり、絵は画素が変わった物だけが書かれます。
  見た目の変わらない直しなら、変わるのは控えだけです。
  控えを手で写して緑にしないこと —— 絵が古いまま残ります。
- **名指して撮っても、控えは変わらない。**
  控えを今に合わせるのは、全部を撮ったときだけです。
- **絵は lossless の WebP で、1 枚 32 KB・全部で 226 KB まで。**
  撮り直すたびに git に積もるからです。
  超えると `site:check` が落ちます。
  そのときは `docs-shots.mjs` の `SHOTS` で、写す箱を小さくするか、高さの上限（`maxHeight`）を下げます。
- **読ませる絵は、本文の幅に収める。**
  docs は絵を画素の大きさのまま載せ、本文より広い絵は縮みます（窓 1280 で 960px の絵が 0.66 になり、字が読めませんでした）。
  そこで、絵は全部同じ窓（`docs-shots.mjs` の `WINDOW`）で、DPR（devicePixelRatio）1 で撮り、本文の幅（`scripts/shots-source.mjs` の `COLUMN`。窓 1280 の本文の幅）以内に切ります。
  超えてよいのは、本文に縮めて載せる表（`SHOTS` の `wide: true`）だけです。
  `site:check` は絵そのものの幅を読み、超えた絵で落ちます。
- **撮る道具は、撮れない絵を撮らずに止まる。**
  撮る前に 3 つを見ます。幅（wide でない絵は `COLUMN` 以内）、切り口（見えている字が、切る矩形の端をまたがない）、番号の丸（切る矩形の中にあり、字に重ならない）。
  dashboard が自分で隠した字（読む所の長い行や省略）は、切れたと数えません。
  止まったら、`SHOTS` の切り方（`maxWidth`・`maxHeight`・`snap`）か丸の置き場を直すか、代役の台本（`sandbox/scenario.json`）の字を短くします。
  欄から字がはみ出しているなら、dashboard の不具合です。
- **Chrome の版は決めてある**（`docs-shots.mjs` の `CHROME_BUILD`）。
  無ければ、道具が最初に `~/.cache/puppeteer` へ入れます。
  字の形は OS のフォントでも変わるので、撮るのは macOS です。
- **絵を足すときは、`SHOTS` に 1 つ足して撮り、ja・en の両方の screens.md に載せる。**
  置き場に在るのに `shots.json` に無い物と、`shots.json` に在るのにどちらかの screens.md が載せていない物は、`site:check` が落とします。
  番号の丸は絵の中に置き、字は数字だけにして、絵ごとに 1 から振ります。
  ja・en で同じ絵を使い、何を指すかは各言語の本文に書きます。

## リリースと公開

1. 変更は枝で作り、main へ PR を出して squash でマージする。
2. マージした main の commit に、手で注釈タグを打つ（`vX.Y.Z — 要約`）。
   版はタグだけです。
   `package.json` の `version` は版ではありません。
3. タグの push で、`docs.yml` が docs を GitHub Pages に公開する。

main にマージしただけでは、Pages は変わりません。
公開する docs を、出した版の docs にするためです（github-pages の環境も、`v*` のタグからの配備だけを許します）。
公開し直すときは、タグを指して `gh workflow run docs.yml --ref vX.Y.Z` です。

docs-site の依存は、Dependabot が週に 1 度、1 本の PR にまとめて上げます。
既知の脆弱性は、`audit.yml` が毎日 lockfile を見ます。
