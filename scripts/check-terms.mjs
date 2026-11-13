/**
 * 語の取り違えを見張る。`npm run check` の中で走る。規則は下の RULES の 14 個。
 *
 * ## なぜ要るのか
 *
 * - **「名乗り」を、物（トークン）の意味で書かない。** 「名乗り」は誰として見るか
 *   （サインインした利用者と組織）を指す。IdP がそれに署名して返す物はアクセストークン
 *   （応答の欄は `access_token`）。2026-10 に、2 つを混ぜた書き方を docs・コメント・設定から除いた
 * - **クロールの seed は「起点」と書く。** Web Capture では 2026-10 に「種」から「起点」へ揃えた
 *   （capture-ledger と capture-scheduler が同じ規則で見張っている）。画面の見出しに
 *   「種」が残っていたのを、新しいクロールの画面（「起点の URL」）を足したときに直した
 * - **クロールは「始める」と書く。** 2026-10 に「起こす」から「始める」へ揃えた（タブは「新しいクロール」、
 *   ボタンは「始める」）。目的語の無い「起こす」は「目を覚まさせる」に読め、タブで 1 つだけ動詞だった。
 *   workbench の `public/` は「起こ」そのものを書かない —— worker は「起動」、hashchange は「発火」と書く。
 *   ほかのファイルでは、クロールを始める意味の形だけを見る。プロセスの「起こす」（`dev:up` が workbench を
 *   起こす、など）は別の意味で、見ない（capture-ledger と capture-scheduler も同じ形で見張っている）
 * - **タブで切り替える画面の 1 つは「〇〇の画面」、全体は workbench と書く。** 2026-10 に、タブの画面の 1 つを
 *   「面」（コードの face の訳）、全体を「画面」と呼ぶ二段をやめた。「面」は単独では表面・側面に読め、
 *   「画面」は全体といま見ている所の 2 つを指していた。全体の「画面」を先に Web アプリの名前へ移してから、
 *   「面」を「画面」に充てた。いま見ている所の意味（画面の上・画面に出る・画面の地）は「画面」のまま
 * - **ページで走らせる物は「スクリプト」と書く。** 2026-10 に「目録」「台本」から
 *   そろえた（タブ「スクリプト」（2026-11 から「スクリプト集」）ほか画面の字 15。置き場の呼び名は 2026-11 に
 *   「台帳」から「登録済みのスクリプト」へ替えた —— 下の「台帳」の項）。「目録」は
 *   browserhive と wacz-validator では WACZ の中の storage の目録を指し、「台本」は代役の台本
 *   （sandbox/scenario.json）とスクリプト 1 本の両方を指していた。workbench は storage の目録を持たないので、
 *   「目録」は全部見る。「台本」は、代役を説明するファイル（SCENARIO）の外では全部、中では
 *   スクリプト 1 本の意味の形（TAIHON）だけを見る（capture-ledger と capture-scheduler も見張っている）
 * - **network は「通信」と書く。** 2026-11 に「網」（network の 1 字の直訳）から「通信」へそろえた（この repo では
 *   コメントの 3 か所。browserhive・capture-ledger・capture-scheduler も同じ日にそろえている）。「網」は読み手に
 *   通じにくい。基盤のネットワーク（私設ネットワーク・default ネットワーク）は「ネットワーク」と書く。
 *   「安全網」「網羅」は別の語で、見ない
 * - **タブ「スクリプト」と「中身」は、「スクリプト集」と「WACZ」と書く。** 2026-11 に（Jira CAPTURE-21）、画面の
 *   名前を「スクリプト集の画面」と「WACZ の画面」に替えた（英語は the script collection view と the WACZ view、
 *   表と見出しは Script collection と WACZ）。タブの名前が、並べている物（スクリプト）やふつうの言葉（中身）と同じ字で、
 *   話や Jira で画面を名指せなかった。物のスクリプト（ページで走らせる JS。新しいクロールの欄の見出し
 *   `<legend>スクリプト</legend>` も）と、ふつうの言葉の中身（WACZ の中身・版の中身）はそのままなので、画面の名前
 *   だった形だけを見る。コードの名前（`#scripts`・`#wacz`・`face-*`）も替えていない。capture-ledger と
 *   capture-scheduler には workbench の画面を名指す文が無いので、そちらには足していない
 * - **箱に書く物は「その場の TS」「スクリプトの名前」「TS の箱」と書く。** 2026-11 に（Jira CAPTURE-83）、
 *   「その場の JS」「JS の名前」「JS の箱」から替えた。箱の中身は compile の段で strict の TypeScript として検査される
 *   のに、JS と名乗っていた（TypeScript を書けると気づけず、素の JS を書くと TS7006 で落ちて理由が読めない）。
 *   JS になるのは変換の後なので、走った JS（`behaviors/custom.jsonl`）・`jsSha256`・束ねた JS・workbench 自身の
 *   素の JS はそのまま。だから形の並びだけを見る。コードの名前（`start-tab-js`・`.start-js`）も替えていない。
 *   capture-ledger と capture-scheduler も同じ形で見張っている
 * - **スクリプトの `sites` は「対象サイト」、版を選ぶ小さなボタンは「版のリンク」と書く。** 2026-11 に「札」から
 *   そろえた（画面の字・docs・コメント・代役・試験の名前で 70 行あまり）。「札」は tag を 1 字で写した書き手の癖で、
 *   読み手に通じない。コードの名前（`chipsOf`・`.rchips`・`siteChip`）も、en の docs の version chips も替えていない
 *   （browserhive・capture-ledger・capture-scheduler も見張っている）
 * - **repo の一式は Web Capture と書く。** 2026-11 に crawler から替えた（文の中は 2 語。`web-capture` はフォルダの
 *   パスだけ）。crawler は、ふつうの名詞（a crawler that follows nothing）とも、動いている識別子（`crawler-storage`・
 *   Windmill の workspace の `crawler`・`Symbol.for("crawler.no-dns")`）とも同じ字で、読み手に区別が付かなかった。
 *   識別子とふつうの名詞は残すので、一式の意味だった形の並びだけを見る
 * - **7080 の Web アプリは capture-workbench、文で短く書くときは workbench と書く。** 2026-11 に dashboard から替えた
 *   （repo の名前・URL・環境変数の `WORKBENCH_*` も）。この repo に、Grafana の dashboard のような別の意味は無いので、
 *   語を全部見る（大文字小文字を問わない）。許す形は無い
 * - **WACZ を開くビューアは replayweb-server と書く。** 2026-11 に replay から替えた（repo の URL・環境変数・`/healthz` の
 *   欄・ファイルの名前）。語の replay は、合本の形式（replay.json）と capture-ledger の答えの欄（`replayBundle`）に残るので禁じず、旧い名前の形だけを見る
 * - **HTTP の method と path の組は「エンドポイント」、待ち受けの番号は「ポート」、その場の TS が走る時は「phase」と
 *   書く。** 2026-11 に（Jira CAPTURE-184）、1 字の語（docs のページの題「中継の口」など）から意味ごとに替えた。
 *   同じ字が 1 文の中でエンドポイントとポートの両方を指していた（「どの〇も、Host が 127.0.0.1:<〇> でなければ」）。
 *   切り口・入口・出口・窓口は別の語なので外してから、残った字を全部見る。capture-ledger・capture-scheduler・
 *   browserhive も見張っている
 * - **「台帳」は使わない。** 2026-11 に（Jira CAPTURE-186）、意味ごとに書き分けた。capture-ledger というシステムは
 *   capture-ledger、スクリプトの置き場は「登録済みのスクリプト」（登録する・登録されていない・画面の「登録 v3」）、
 *   DB に入ったことは「capture-ledger に載る」。2 字が 5 つの物（システム・DB の行・置き場・BrowserHive の中の記録・
 *   呼び手の記録）を兼ね、帳簿の語なのに「台帳が 400 で断る」と動く主語になっていた。許す語は無いので、字を全部見る。
 *   capture-ledger・capture-scheduler・browserhive も見張っている
 *
 * 書き手（人と Claude）は長くこの形で書いてきたので、見張らなければ戻ってくる。
 *
 * ## 何を見るか
 *
 * git が repo の中身と見なす text のファイル（追跡している物と、まだ add していない物）の全行。docs に限らない
 * —— 語は、書かれる場所を選ばずに広がる。
 *
 * ## 見ないもの
 *
 *   - lockfile。この repo の言葉ではない
 *   - この file 自身。説明と、探す字そのものを書くため
 *   - sandbox/catalog/。capture-scripts のスクリプトの写しで、別の repo の言葉（autofetch.ts の「変種」は
 *     seed ではなく、host.d.ts の「網」は capture-scripts の版の言葉）。直すと行番号が実物とずれる
 *     （読む所の行と下敷きの行を、代役で実物どおりに見るため）
 *   - 「名乗り」を誰として見るかの意味で使っているか、「起点」を seed の意味で使っているか、
 *     「起こす」がクロールの意味か、「スクリプト」「中身」が画面の名前か。語の意味は機械には見えないので、3 つ目と、
 *     4 つ目の全体の「画面」と、5 つ目の代役のファイルの中の「台本」と、7 つ目の古い画面の名前と、8 つ目の箱の古い呼び名と、10 個目の一式の古い呼び名は形の並びで見る
 *     （並びに無い言い回しは止まらない）
 *
 * 形は capture-ledger の src/tools/check-terms.ts に揃えてある。
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repoFiles } from "./repo-files.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SELF = "scripts/check-terms.mjs";
/** 別の repo の言葉の写し（上の「見ないもの」）。 */
const COPIED = "sandbox/catalog/";

/** 名乗り（誰として）とトークン（物）を混ぜた形。足すときは、正しい使い方に当たらないことを確かめる。 */
const MIXED = /名乗りのトークン|名乗りを取|名乗るトークン|identity token/iu;
/** 「種」を seed の意味に取れない形。capture-ledger と同じ（種類・種別・数の後の「種」）。 */
const NOT_SEED = /種類|種別|\d\s?種/gu;
/** 「網」を network の意味に取れない形（安全網・網羅）。capture-ledger・capture-scheduler と同じ。 */
const NOT_NET = /安全網|網羅/gu;
/**
 * 「口」を、エンドポイント・ポート・phase の意味に取れない語。workbench に在るのは切り口だけ（2026-11）。
 * 「注入口」は「入口」を含むので、外す前に名指しで止める。capture-ledger・capture-scheduler も同じ形。
 */
const NOT_KUCHI = /切り口|入口|出口|窓口/gu;
/** 画面のファイル。ここには「起こ」を 1 つも書かない（同梱の vendor は別の repo の言葉）。 */
const SCREEN = "public/";
const VENDOR = "public/vendor/";
/**
 * クロールを始める意味の「起こす」の形。capture-ledger・capture-scheduler と同じ並び。
 * 足すときは、プロセスの「起こす」（dev:up が起こす・起こし直す・webhook で起こす）に当たらないことを確かめる。
 */
const OKOSU =
  /クロールを起こ|クロールは起こ|取り込みを起こ|取り込みの実行を起こ|起こしたクロール|起こせ(ます|ません|る|ない|れば|ば|て)|起こす(面|欄)|起こした(人|本人|行)|起こしました|起こしてよ|下敷きにして起こ|「起こす」|"起こす"/u;
/** 「面」を、タブの画面の 1 つの意味に取れない熟語。workbench に在るのは「画面」だけ（2026-10）。 */
const NOT_VIEW = /画面|場面|表面|当面|全面|一面|側面|正面|方面|面倒|面積|面白/gu;
/**
 * 全体を「画面」と呼ぶ形。全体は workbench と書く。「この画面」は入れない —— タブの画面の 1 つの意味
 * （「この画面に残る」）でも使う。足すときは、いま見ている所の意味（画面の上・画面に出る）に当たらないことを確かめる。
 */
const WHOLE =
  /画面自身|画面のサーバ|画面を起こ|画面を配|画面 ?[（(]repo|画面の検査|画面のロジック|開発用の画面|画面の依存|画面から切り出|画面は npm|画面の待受|画面の Host|画面のページから|既に動いているこの画面|画面を 70\d\d|画面が 70\d\d/u;

/** 代役の台本（sandbox/scenario.json）を説明するファイル。ここの「台本」は、ほとんどが代役の意味。 */
const SCENARIO =
  /^sandbox\/|^test\/sandbox\.test\.mjs$|^docs-site\/scripts\/docs-shots\.mjs$|^docs-site\/src\/content\/docs\/ja\/development\.md$/u;
/** スクリプト 1 本の意味の「台本」の形。SCENARIO の中でも、この形は赤。 */
const TAIHON = /サイト用の台本|対象サイトの(無い|ある)台本|合わない台本|対象サイトを省いた台本|見本の台本/u;
/**
 * 古い画面の名前（2026-11 まで）。物のスクリプトと、ふつうの言葉の中身は残すので、画面の名前だった形だけを並べる。
 * 足すときは、物の意味（`<legend>スクリプト</legend>`・登録済みのスクリプトがありません）・ふつうの言葉
 * （WACZ の中身）・新しい名前（スクリプト集の画面）・コードの名前（`#scripts`・`/api/scripts`）に当たらないことを
 * 確かめる。英語は頭の字だけ大小を許す（`/i` にすると、npm の scripts のような小文字の表の行にも当たる）。
 * タブの字は辞書（`public/i18n/*.json` の `common.tab.*`）に在るので、辞書の行の形（`"common.tab.scripts": "…"`）も見る。
 */
const OLD_VIEW =
  /スクリプトの画面|中身の画面|タブ「(?:スクリプト|中身)」|「中身」|>(?:スクリプト|中身)<\/button>|<th>中身<\/th>|"common\.tab\.[a-z]+": "(?:スクリプト|中身|Scripts|Contents)"|検証・中身・|^## スクリプト\s*$|^\| (?:スクリプト|中身) \||\b[Ss]cripts [Vv]iew\b|\b[Cc]ontents (?:[Vv]iew|[Tt]ab)\b|^## Scripts\s*$|^\| (?:Scripts|Contents) \|/u;
/**
 * 箱に書く物の古い呼び名（2026-11 まで）。JS になるのは変換の後なので、走った JS・変換後の JS・束ねた JS・素の JS は
 * 当てない。足すときは、それらと `jsSha256` に当たらないことを確かめる。
 */
const OLD_INLINE =
  /その場の JS|その場で書いた JS|JS の名前|JS の箱|書きかけの JS|この JS の id|その JS の id|\binline JS\b/u;
/** replayweb-server の旧い名前の形。語の replay は禁じない（上の注記）。 */
const OLD_REPLAY_NAMES =
  /uraitakahito[/:]replay(?![\w-])|\bWORKBENCH_REPLAY_URL\b|\breplayOrigin\b|\bpublic\/replay\.js\b|\btest\/replay\.test\.mjs\b/u;

/**
 * 一式の意味の crawler の形（2026-11 まで）。足すときは、動いている識別子（`crawler-storage`・`/w/crawler/`・
 * `workspace=crawler`・`crawler.no-dns`）と、ふつうの名詞（a crawler that…・The crawler honoured…・Browsertrix Crawler）に
 * 当たらないことを確かめる。カタカナのクローラは見ない。
 */
const OLD_SUITE =
  /(?<![-/.=`\w])crawler ?(?:の|で|が|を|は|に|と|全体|—)|<h1>crawler<\/h1>|\bcrawler repos(?:itories)?\b|\ball of crawler\b|\b[Tt]he crawler's development\b|\b[Tt]he crawler (?:shares|produces)\b/u;

const RULES = [
  {
    find: (line) => MIXED.test(line),
    say:
      "「名乗り」を物の意味で書いています。issuer が返す物はアクセストークン（英語版は access token）と書き、" +
      "「名乗り」は誰として見るかにだけ使います。",
  },
  {
    find: (line) => line.replace(NOT_SEED, "").includes("種"),
    say: "「種」が残っています。クロールの seed は「起点」と書きます（本で数えるなら「起点の URL が N 本」）。",
  },
  {
    find: (line, file) =>
      file.startsWith(SCREEN) && !file.startsWith(VENDOR) ? line.includes("起こ") : OKOSU.test(line),
    say:
      "「起こす」が残っています。クロールは「始める」と書きます（タブは「新しいクロール」）。" +
      "workbench の public/ では、プロセスの意味でも「起動」と書きます。",
  },
  {
    find: (line) => line.replace(NOT_VIEW, "").includes("面") || WHOLE.test(line),
    say:
      "「面」か、全体の意味の「画面」が残っています。タブで切り替える画面の 1 つは「〇〇の画面」、" +
      "全体は workbench と書きます（画面の上・画面に出る、のような、いま見ている所の意味はそのまま）。",
  },
  {
    // workbench は storage の目録（browserhive・wacz-validator の意味）を使わないので、「目録」は全部赤
    find: (line, file) =>
      line.includes("目録") || (SCENARIO.test(file) ? TAIHON.test(line) : line.includes("台本")),
    say:
      "「目録」か、スクリプトの意味の「台本」が残っています。ページで走らせる物は「スクリプト」、" +
      "置き場は「登録済みのスクリプト」（登録されていない・登録 v3）、対象サイトのある物は「サイト用のスクリプト」と書きます（代役の台本はそのまま）。",
  },
  {
    find: (line) => line.replace(NOT_NET, "").includes("網"),
    say:
      "「網」が残っています。network は「通信」（通信の記録・通信が静まる・通信に載せる）、" +
      "基盤のネットワークは「ネットワーク」と書きます。",
  },
  {
    find: (line) => OLD_VIEW.test(line),
    say:
      "古い画面の名前が残っています。タブは「スクリプト集」と「WACZ」、画面は「スクリプト集の画面」と「WACZ の画面」、" +
      "英語は the script collection view と the WACZ view と書きます（物のスクリプトと、ふつうの言葉の中身はそのまま）。",
  },
  {
    find: (line) => OLD_INLINE.test(line),
    say:
      "箱の古い呼び名が残っています。箱に書く物は TypeScript なので、「その場の TS」「スクリプトの名前」「TS の箱」と" +
      "書きます（変換後の JS・束ねた JS・jsSha256 はそのまま）。",
  },
  {
    find: (line) => line.includes("札"),
    say: "「札」が残っています。スクリプトの `sites` は「対象サイト」、版を選ぶ小さなボタンは「版のリンク」と書きます。",
  },
  {
    find: (line) => OLD_SUITE.test(line),
    say:
      "一式の古い呼び名が残っています。repo の一式は Web Capture と書きます（`crawler-storage`・Windmill の workspace の " +
      "`crawler`・ふつうの名詞の crawler はそのまま）。",
  },
  {
    find: (line) => /dashboard/iu.test(line),
    say:
      "語 dashboard が残っています。7080 の Web アプリは capture-workbench（文で短く書くときは workbench）、" +
      "環境変数は WORKBENCH_* と書きます。",
  },
  {
    find: (line) => OLD_REPLAY_NAMES.test(line),
    say:
      "replay の旧い名前が残っています。WACZ を開くビューアは replayweb-server（環境変数は WORKBENCH_REPLAYWEB_SERVER_URL、" +
      "`/healthz` の欄は replaywebServerOrigin）と書きます。",
  },
  {
    find: (line) => /注入口/u.test(line) || line.replace(NOT_KUCHI, "").includes("口"),
    say:
      "「口」が残っています。HTTP の method と path の組は「エンドポイント」（書き込みのエンドポイント・読み取りの" +
      "エンドポイント）、待ち受けの番号は「ポート」、その場の TS が走る時（読み込みの後・遷移の前）は「phase」と書きます" +
      "（切り口・入口・出口はそのまま）。",
  },
  {
    find: (line) => line.includes("台帳"),
    say:
      "「台帳」が残っています。システムは capture-ledger、置き場は「登録済みのスクリプト」（登録する・登録されていない・登録 v3）、" +
      "DB に入ったことは「capture-ledger に載る」と書きます（CAPTURE-186）。",
  },
];

// 追跡している物と、まだ add していない新しい物（`repo-files.mjs`）。
const files = repoFiles(ROOT).filter(
  (f) => f !== SELF && !f.endsWith("package-lock.json") && !f.startsWith(COPIED),
);

const hits = RULES.map(() => []);
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (text.includes("\0")) continue; // WACZ の標本などの binary
  text.split("\n").forEach((line, i) => {
    RULES.forEach((rule, r) => {
      if (rule.find(line, file)) hits[r].push(`${file}:${String(i + 1)}: ${line.trim()}`);
    });
  });
}

const failing = RULES.filter((_, r) => hits[r].length > 0);
for (const [r, rule] of RULES.entries()) {
  if (hits[r].length === 0) continue;
  console.error(rule.say);
  for (const hit of hits[r]) console.error(`  ${hit}`);
}
if (failing.length > 0) process.exit(1);
console.log(`check:terms: ${String(files.length)} ファイルを見て、0 件`);
