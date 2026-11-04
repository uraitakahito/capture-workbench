/**
 * 新しいクロールの画面の部品（`public/start.js`）。送る body と、答えの言い方。
 *
 * 送る道（`POST /api/crawls` の中継）と門は http の口に在り、門の判定は `lib.test.mjs` が見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addRow,
  addSkipRow,
  asTemplate,
  bodyBytes,
  checkQuery,
  declaredOf,
  defaultIds,
  hasNocheck,
  marksOf,
  moveRow,
  NOCHECK,
  onSeed,
  plainClick,
  PRESETS,
  removeRow,
  scriptsOf,
  seedHosts,
  sizeOf,
  startAnswer,
  startBody,
  summaryOf,
  variablesOf,
  withNocheck,
} from "../public/start.js";

test("起点は 1 行に 1 本 —— 前後の空白と空行を落とし、順番は保つ", () => {
  const body = startBody("  https://site.test/ \n\n https://site.test/docs/\n", null);
  assert.deepEqual(body.seeds, ["https://site.test/", "https://site.test/docs/"]);
});

test("「このページだけ」は maxDepth: 0 だけを送り、規則は送らない", () => {
  assert.deepEqual(startBody("https://site.test/", null), { seeds: ["https://site.test/"], maxDepth: 0 });
});

test("「リンクを辿る」は規則を必ず送り、深さと枚数は書いたときだけ送る（空なら台帳の既定）", () => {
  const rows = [
    { action: "skip", pattern: " ads.site.test " },
    { action: "follow", pattern: "same-site" },
  ];
  const blank = startBody("https://site.test/", { maxDepth: "", maxPages: " ", rows });
  assert.deepEqual(blank, {
    seeds: ["https://site.test/"],
    // 当てる物は前後の空白だけ落とす。鍵が 1 つの object（台帳の形）
    rules: [{ skip: "ads.site.test" }, { follow: "same-site" }],
  });
  const filled = startBody("https://site.test/", { maxDepth: "3", maxPages: "200", rows });
  assert.equal(filled.maxDepth, 3);
  assert.equal(filled.maxPages, 200);
});

test("URL は検査しない —— 読めない URL も、そのまま台帳へ送る", () => {
  assert.deepEqual(startBody("ftp://site.test/\nnot a url", null).seeds, ["ftp://site.test/", "not a url"]);
});

test("空の欄は、空の seeds になる（dashboard はこれを送らない）", () => {
  assert.deepEqual(startBody(" \n \n", null).seeds, []);
});

test("202 は始めた 1 本を、409 は塞いでいる 1 本を、決めた文で名指す", () => {
  const ok = startAnswer(202, { crawlId: "9072b625-1111-4000-8000-000000000000" });
  assert.equal(ok.kind, "ok");
  assert.equal(ok.text, "始めました（crawl 9072b625）。一覧の行に印を付けました。");
  const busy = startAnswer(409, {
    error: "a crawl is already in progress",
    crawlId: "5b0c0001-6a1e-4000-8000-000000000001",
    startedAt: "2026-10-13T00:00:00.000Z",
  });
  assert.equal(busy.kind, "run");
  assert.equal(busy.text, "走行中のクロールがあります（crawl 5b0c0001）。終わるまで次は始められません。");
  // 塞いでいる行が見つからなかった 409 は id を持たない。空の括弧を出さない
  assert.doesNotMatch(startAnswer(409, { error: "a crawl is already in progress" }).text, /（crawl /);
});

test("台帳の文は言い換えず、hint があれば添える", () => {
  const empty = startAnswer(400, {
    error: "no scripts are registered",
    hint: "pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])",
  });
  assert.equal(empty.kind, "bad");
  assert.equal(
    empty.text,
    "400 —— no scripts are registered（pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])）",
  );
  assert.equal(startAnswer(404, { error: "not found" }).text, "404 —— not found");
});

test("Fastify の答えは message を拾う —— error には \"Not Found\" しか無い", () => {
  const noRoute = startAnswer(404, {
    message: "Route POST:/api/crawls not found",
    error: "Not Found",
    statusCode: 404,
  });
  assert.equal(noRoute.text, "404 —— Route POST:/api/crawls not found");
});

test("dashboard のサーバに届かなければ、そう言う", () => {
  assert.equal(startAnswer(0, { error: "Failed to fetch" }).text, "dashboard 自身に届きません（Failed to fetch）");
});

/**
 * 走らせるものの欄。台帳のスクリプトは札の無い autofetch・autoscroll の 2 本（スクリプト集の画面と同じ id 順）で、
 * どちらも既定の顔ぶれとする（autofetch を既定から外した台帳は、下の `SCRIPTS`）。
 */
const CATALOG = ["autofetch", "autoscroll"];
const NO_INLINE = { name: "", phase: "behavior", source: "" };
const run = (picked, inline = NO_INLINE) => ({ catalog: CATALOG, picked, defaults: CATALOG, inline });

test("走らせるものが既定のまま（既定の顔ぶれを全部選び、その場の JS が空）なら scripts を送らない", () => {
  // 台帳の既定と、台帳にスクリプトが無いときの 400 を生かす
  assert.equal("scripts" in startBody("https://site.test/", null, run(CATALOG)), false);
  // 台帳にスクリプトが無く、その場の JS も無いときも送らない（台帳が「スクリプトが無い」と言う）
  assert.equal(scriptsOf({ catalog: [], picked: [], defaults: [], inline: NO_INLINE }), undefined);
});

test("スクリプトを 1 つ外すと、選んだ物だけを台帳の並びで送る", () => {
  // 押した順ではなく、台帳の並び
  assert.deepEqual(scriptsOf(run(["autoscroll"])), [{ catalog: "autoscroll" }]);
  assert.deepEqual(scriptsOf(run(["autoscroll", "autofetch"], { ...NO_INLINE, source: "x;" })).slice(1), [
    { catalog: "autofetch" },
    { catalog: "autoscroll" },
  ]);
});

test("起点のホストは台帳と同じく hostname —— 小文字になり、IDN は punycode になる", () => {
  assert.deepEqual([...seedHosts("HTTPS://WWW.Site.test/a\nhttps://日本.jp/")], ["www.site.test", "xn--wgv71a.jp"]);
});

test("読めない行と空行は、起点のホストに数えない（台帳が 400 で言う）", () => {
  assert.deepEqual([...seedHosts(" \nnot a url\n\n https://site.test/ \n")], ["site.test"]);
  assert.equal(seedHosts("").size, 0);
});

/**
 * 台帳の `GET /api/scripts` の形（id 順）。札の無い 2 本のうち autofetch は既定に入らない（capture-scripts の
 * カタログの `default: false`）。もう 1 本は laws.e-gov.go.jp 用。
 */
const SITE = { id: "egov-law-search", sites: ["laws.e-gov.go.jp"], enabled: true };
const SCRIPTS = [{ id: "autofetch", sites: [], enabled: false }, { id: "autoscroll", sites: [], enabled: true }, SITE];
const IDS = SCRIPTS.map((script) => script.id);

test("札の無いスクリプトは、起点が無くても、どの起点でも既定", () => {
  assert.deepEqual(defaultIds(SCRIPTS, new Set()), ["autoscroll"]);
  assert.deepEqual(defaultIds(SCRIPTS, seedHosts("https://other-site.test/")), ["autoscroll"]);
});

test("既定に入らないスクリプト（enabled: false）は、どの起点でも既定に数えない —— サイト用でも", () => {
  assert.equal(defaultIds(SCRIPTS, seedHosts("https://laws.e-gov.go.jp/")).includes("autofetch"), false);
  const offSite = { ...SITE, enabled: false };
  assert.deepEqual(defaultIds([SCRIPTS[1], offSite], seedHosts("https://laws.e-gov.go.jp/")), ["autoscroll"]);
});

test("サイト用のスクリプトは、起点のどれかが札のホストにあるときだけ既定 —— ポートは見ない", () => {
  assert.deepEqual(defaultIds(SCRIPTS, seedHosts("https://other-site.test/\nhttp://laws.e-gov.go.jp:8080/a")), [
    "autoscroll",
    "egov-law-search",
  ]);
  // 完全一致。同じ e-Gov でも別のホスト（www.e-gov.go.jp）は合わない
  assert.equal(onSeed(SITE, seedHosts("https://www.e-gov.go.jp/")), false);
});

test("起点に合わないサイト用のスクリプトは既定に数えない —— 残りを全部選んでいれば scripts を省く", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://other-site.test/"));
  assert.equal(scriptsOf({ catalog: IDS, picked: defaults, defaults, inline: NO_INLINE }), undefined);
});

test("起点に合うサイト用のスクリプトを外したら scripts を送る —— 省くと台帳が既定で入れる", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://laws.e-gov.go.jp/"));
  assert.deepEqual(scriptsOf({ catalog: IDS, picked: ["autoscroll"], defaults, inline: NO_INLINE }), [
    { catalog: "autoscroll" },
  ]);
  // 付けたままなら省く（台帳が同じ 2 本を選ぶ）
  assert.equal(scriptsOf({ catalog: IDS, picked: ["autoscroll", "egov-law-search"], defaults, inline: NO_INLINE }), undefined);
});

test("既定に入らないスクリプトを付けたら scripts を送る —— 省くと台帳は入れない", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://other-site.test/"));
  assert.deepEqual(scriptsOf({ catalog: IDS, picked: ["autofetch", "autoscroll"], defaults, inline: NO_INLINE }), [
    { catalog: "autofetch" },
    { catalog: "autoscroll" },
  ]);
});

test("全部外すと scripts: [] を送る —— 何も走らせない", () => {
  assert.deepEqual(startBody("https://site.test/", null, run([])).scripts, []);
});

test("その場の JS は先頭に、名前・phase・source を送る（source は削らない）", () => {
  const source = "\n(() => {\n  void 0;\n})();\n\n";
  const body = startBody("https://site.test/", null, run(CATALOG, { name: " close-banner ", phase: "preload", source }));
  assert.deepEqual(body.scripts, [
    { inline: { name: "close-banner", phase: "preload", source } },
    { catalog: "autofetch" },
    { catalog: "autoscroll" },
  ]);
});

test("空白だけの JS は送らない", () => {
  assert.equal(scriptsOf(run(CATALOG, { name: "x", phase: "behavior", source: " \n\t" })), undefined);
});

test("名前の綴りは検査しない —— 読めない名前も、そのまま台帳へ送る", () => {
  const body = startBody("https://site.test/", null, run(CATALOG, { name: "Close_Banner", phase: "behavior", source: "x;" }));
  assert.equal(body.scripts[0].inline.name, "Close_Banner");
});

test("台帳が名指した ids を、文の後に添える", () => {
  assert.equal(
    startAnswer(400, { error: "unknown script ids", ids: ["typo-scroll"] }).text,
    "400 —— unknown script ids: typo-scroll",
  );
  assert.equal(
    startAnswer(400, { error: "duplicate script ids", ids: ["inline-a", "autofetch"] }).text,
    "400 —— duplicate script ids: inline-a, autofetch",
  );
});

// ── クロールごとの値（変数とシークレット。capture-ledger v0.67.0）────────────

/** 台帳の `GET /api/scripts` の 1 行が運ぶ宣言（capture-scripts の catalog.json の `params`）。 */
const QUERY = { name: "query", kind: "variable", required: false, summary: "法令名の検索語。省けばソースの既定" };
const TOKEN = { name: "api_token", kind: "secret", required: true, summary: "会員 API のトークン" };
const DECLARING = [
  // 宣言を運ばない台帳（v0.66 まで）の行には params が無い
  { id: "autoscroll", sites: [], enabled: true },
  { id: "egov-law-search", sites: ["laws.e-gov.go.jp"], enabled: true, params: [QUERY] },
  { id: "member-pages", sites: [], enabled: false, params: [TOKEN, { ...QUERY, required: true, summary: "別の説明" }] },
];

test("宣言はチェックしたスクリプトの物だけを台帳の並びで集め、同じ名前は 1 つにまとめる（必須はどれかが必須なら必須）", () => {
  assert.deepEqual(declaredOf(DECLARING, ["egov-law-search"], "variable"), [
    { name: "query", required: false, summary: QUERY.summary, by: ["egov-law-search"] },
  ]);
  assert.deepEqual(declaredOf(DECLARING, ["egov-law-search", "member-pages"], "variable"), [
    { name: "query", required: true, summary: QUERY.summary, by: ["egov-law-search", "member-pages"] },
  ]);
  assert.deepEqual(declaredOf(DECLARING, ["member-pages"], "secret"), [
    { name: "api_token", required: true, summary: TOKEN.summary, by: ["member-pages"] },
  ]);
  // params を運ばない行と、チェックを外した物は何も宣言しない
  assert.deepEqual(declaredOf(DECLARING, ["autoscroll"], "variable"), []);
  assert.deepEqual(declaredOf(DECLARING, [], "secret"), []);
});

test("送る変数は宣言された名前の値だけ。空白だけの欄と、宣言から外れた名前は送らず、値は削らない", () => {
  const declared = declaredOf(DECLARING, ["egov-law-search"], "variable");
  const values = new Map([
    ["query", " 個人情報 "],
    ["api_token", "x"],
    ["gone", "y"],
  ]);
  assert.deepEqual(variablesOf(declared, values), { query: " 個人情報 " });
  assert.deepEqual(variablesOf(declared, new Map([["query", " \t"]])), {});
  assert.deepEqual(variablesOf(declared, new Map()), {});
});

test("startBody は変数が 1 つでも在るときだけ variables を持つ", () => {
  assert.equal("variables" in startBody("https://site.test/", null, run(CATALOG), {}), false);
  assert.equal("variables" in startBody("https://site.test/", null), false);
  assert.deepEqual(startBody("https://laws.e-gov.go.jp/", null, run(CATALOG), { query: "個人情報" }), {
    seeds: ["https://laws.e-gov.go.jp/"],
    maxDepth: 0,
    variables: { query: "個人情報" },
  });
});

test("変数とシークレットの 400 は、台帳が名指した名前（シークレットは Windmill の path も）を文の後に添える", () => {
  assert.equal(startAnswer(400, { error: "missing variables", names: ["query"] }).text, "400 —— missing variables: query");
  assert.equal(
    startAnswer(400, { error: "unknown variables", names: ["qeury", "waitms"] }).text,
    "400 —— unknown variables: qeury, waitms",
  );
  assert.equal(
    startAnswer(400, {
      error: "unknown secrets",
      secrets: [{ name: "api_token", path: "f/waggle_secrets/api_token", declaredBy: ["inline-probe"] }],
      hint: "wmill variable add f/waggle_secrets/api_token --value … --secret",
    }).text,
    "400 —— unknown secrets: api_token（f/waggle_secrets/api_token）" +
      "（wmill variable add f/waggle_secrets/api_token --value … --secret）",
  );
  assert.equal(
    startAnswer(400, { error: "not a secret variable", secrets: [{ name: "api_token" }] }).text,
    "400 —— not a secret variable: api_token",
  );
  assert.equal(
    startAnswer(400, { error: "secrets cannot be passed as variables", names: ["api_token"] }).text,
    "400 —— secrets cannot be passed as variables: api_token",
  );
  // 宣言の形が読めないその場の JS は、id と理由（hint）
  assert.equal(
    startAnswer(400, { error: "invalid params", script: "inline-probe", hint: "同じ名前が 2 度: q" }).text,
    "400 —— invalid params: inline-probe（同じ名前が 2 度: q）",
  );
  assert.equal(startAnswer(503, { error: "windmill unreachable" }).text, "503 —— windmill unreachable");
});

test("本文の大きさは、門と同じく UTF-8 のバイトで数える", () => {
  // 「例」は 3 バイト。JS の文字列の長さ（UTF-16）なら 27 になる
  assert.equal(bodyBytes({ seeds: ["https://例.jp/"] }), 29);
  // 改行は JSON の中で \n（2 バイト）になる
  assert.equal(bodyBytes({ source: "a\nb" }), 17);
});

test("上限ちょうどは送れ、1 バイト超えは送れない", () => {
  assert.equal(sizeOf("x", 1024, 1024).over, false);
  assert.equal(sizeOf("x", 1025, 1024).over, true);
  assert.equal(sizeOf("x", 512, 1024).percent, 50);
  // 上限を知らなければ止めない（門が 413 で言う）
  assert.equal(sizeOf("x", 10 ** 9, Infinity).over, false);
});

test("行数は JS の行で、空の箱は 0 行", () => {
  assert.equal(sizeOf("", 0, 1024).lines, 0);
  assert.equal(sizeOf("a", 0, 1024).lines, 1);
  assert.equal(sizeOf("a\n", 0, 1024).lines, 2);
});

test("型を検査しないと 1 行目に印が入り、外すと消える —— ほかの行は 1 バイトも変えない", () => {
  const source = "  (() => {\n    void 0;\n  })();\n";
  const on = withNocheck(source, true);
  assert.equal(on, `${NOCHECK}\n${source}`);
  assert.equal(withNocheck(on, false), source);
  // 既に合っていれば触らない
  assert.equal(withNocheck(on, true), on);
  assert.equal(withNocheck(source, false), source);
  // 印だけの 1 行を外すと空になる
  assert.equal(withNocheck(NOCHECK, false), "");
});

test("貼った JS が印を持っていれば、付いた状態で始まる", () => {
  assert.equal(hasNocheck(`${NOCHECK}\nvoid 0;`), true);
  assert.equal(hasNocheck(`  ${NOCHECK}  \nvoid 0;`), true);
  // 2 行目の印は数えない（ts-compile-service も 1 行目しか見ない）
  assert.equal(hasNocheck(`void 0;\n${NOCHECK}`), false);
  assert.equal(hasNocheck(""), false);
});

test("下敷き: __bh.opts[\"<id>\"] の形を替え、替えた行を返す", () => {
  const source = [
    ' * 設定 (`--options`) は `__bh.opts["autoscroll"]` から引く:',
    "(async () => {",
    '  const opts = globalThis.__bh.opts["autoscroll"] ?? {};',
    "  globalThis.__bh.report({ steps: 1 });",
    "})();",
  ].join("\n");
  const { source: out, changed } = asTemplate(source, "autoscroll", "my-autoscroll");
  assert.deepEqual(changed, [1, 3]);
  assert.equal(
    out,
    [
      ' * 設定 (`--options`) は `__bh.opts["inline-my-autoscroll"]` から引く:',
      "(async () => {",
      '  const opts = globalThis.__bh.opts["inline-my-autoscroll"] ?? {};',
      "  globalThis.__bh.report({ steps: 1 });",
      "})();",
    ].join("\n"),
  );
});

test("下敷き: ほかの綴りは触らない（ログ・地の文・__bh. の無い opts・別の id・report の引数）", () => {
  const source = [
    'console.log("autoscroll");',
    " * built-in の `autoscroll` を送る形に",
    'const x = cfg.opts["autoscroll"];',
    'const y = globalThis.__bh.opts["autofetch"];',
    'const z = globalThis.__bh.opts["autoscroller"];',
    'globalThis.__bh.log.info("autoscroll", { steps: 1 });',
    // report は id を取らない（誰の行かは BrowserHive が付ける）。古い 2 引数の呼び方も替えない —— 型の検査が言う
    'globalThis.__bh.report("autoscroll", {});',
  ].join("\n");
  const { source: out, changed } = asTemplate(source, "autoscroll", "my-autoscroll");
  assert.deepEqual(changed, []);
  assert.equal(out, source);
});

test("「読む」を右の列で開くのは、ふつうに押したときだけ（修飾キーと中ボタンはブラウザに任せる）", () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(plainClick(plain), true);
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    assert.equal(plainClick({ ...plain, [key]: true }), false, key);
  }
  assert.equal(plainClick({ ...plain, button: 1 }), false);
});

// ── 辿り方（規則の表）─────────────────────────────────────────────

test("型はどれも「撮って辿る」を 1 本持つ —— 起点が当たらないと台帳が 400 で断る", () => {
  for (const [name, rows] of Object.entries(PRESETS)) {
    assert.ok(rows.some((row) => row.action === "follow"), name);
  }
  assert.deepEqual(PRESETS.siteAndOneHop, [
    { action: "follow", pattern: "same-site" },
    { action: "capture", pattern: "any" },
  ]);
});

test("落とす行はいちばん上に、ふつうの行はいちばん下に足す", () => {
  const rows = [{ action: "follow", pattern: "same-site" }];
  // 広い「撮って辿る」の下に置くと覆われる（台帳が 400 で断る）ので、上に入れる
  assert.deepEqual(addSkipRow(rows), [{ action: "skip", pattern: "" }, ...rows]);
  assert.deepEqual(addRow(rows), [...rows, { action: "capture", pattern: "" }]);
  // 元の並びは変えない（表は答えが来るまで前の並びで描くことがある）
  assert.equal(rows.length, 1);
});

test("行を上下に移し、端を越える動きは何もしない。消すと詰める", () => {
  const rows = ["a", "b", "c"].map((pattern) => ({ action: "skip", pattern }));
  const names = (list) => list.map((row) => row.pattern).join("");
  assert.equal(names(moveRow(rows, 2, -1)), "acb");
  assert.equal(names(moveRow(rows, 0, 1)), "bac");
  assert.equal(moveRow(rows, 0, -1), rows);
  assert.equal(moveRow(rows, 2, 1), rows);
  assert.equal(names(removeRow(rows, 1)), "ac");
});

test("確かめの query は、起点の空行を落とし、規則を「動き:当てる物」で並べる", () => {
  const query = checkQuery("https://www.site.test/\n\n", [
    { action: "skip", pattern: " https://www.site.test/search?q=1 " },
    { action: "follow", pattern: "same-site" },
  ]);
  const params = new URLSearchParams(query);
  assert.deepEqual(params.getAll("seed"), ["https://www.site.test/"]);
  // 当てる物の : と ? と = は、台帳が最初の : で切るので崩れない
  assert.deepEqual(params.getAll("rule"), ["skip:https://www.site.test/search?q=1", "follow:same-site"]);
});

/** 台帳の確かめの口の答え（capture-ledger v0.62.0 の形）。 */
const ANSWER = {
  seeds: [{ url: "https://www.site.test/", valid: true, site: "site.test", followed: true }],
  rules: [
    { rule: 1, action: "skip", kind: "prefix", pattern: "https://www.site.test/search" },
    { rule: 2, action: "follow", kind: "scope", pattern: "same-site" },
    { rule: 3, action: "capture", kind: "scope", pattern: "any" },
  ],
  ok: true,
};
const FOLLOW = { maxDepth: "3", maxPages: "200", rows: [] };

test("行ごとの印は、読めた種類か、読めない・覆われているの文", () => {
  const answer = {
    ...ANSWER,
    rules: [
      { rule: 1, action: "follow", kind: "scope", pattern: "same-site" },
      { rule: 2, action: "skip", kind: "domain", pattern: "ads.site.test", coveredBy: 1 },
      { rule: 3, action: "skip", kind: "invalid", pattern: "ADS.site.test" },
    ],
    ok: false,
  };
  assert.deepEqual(marksOf(answer, 3), [
    { text: "範囲", bad: false },
    { text: "1 行目に覆われて当たりません。上へ移してください", bad: true },
    { text: "読めません（小文字のホスト名・http(s) の URL・範囲の名前のどれか）", bad: true },
  ]);
});

test("答えの行の数が表と違えば、印を出さない（表を変えた直後の、前の表の答え）", () => {
  assert.deepEqual(marksOf(ANSWER, 2), [
    { text: "", bad: false },
    { text: "", bad: false },
  ]);
  assert.deepEqual(marksOf(undefined, 1), [{ text: "", bad: false }]);
});

test("確かめの文は、上の行から何をするかを言い、same-site は起点のサイトの名前で言う", () => {
  const said = summaryOf(ANSWER, FOLLOW);
  assert.equal(said.bad, false);
  assert.equal(
    said.text,
    "上の行から当てます。1 行目 https://www.site.test/search で始まる URL は落とす、" +
      "2 行目 site.test の中は撮って辿る、3 行目 どこでも撮るだけ。" +
      "どれにも当たらないリンクは落とします。3 段・200 枚まで。",
  );
});

test("深さと枚数が空なら台帳の既定と言い、始められない理由を最後に並べる", () => {
  const answer = {
    seeds: [
      { url: "https://ads.site.test/", valid: true, site: "site.test", followed: false },
      { url: "not a url", valid: false },
    ],
    rules: [
      { rule: 1, action: "follow", kind: "scope", pattern: "same-site" },
      { rule: 2, action: "skip", kind: "domain", pattern: "ads.site.test", coveredBy: 1 },
      { rule: 3, action: "skip", kind: "invalid", pattern: "*.site.test" },
    ],
    ok: false,
  };
  const said = summaryOf(answer, { maxDepth: "", maxPages: "", rows: [] });
  assert.equal(said.bad, true);
  assert.match(said.text, /台帳の既定の深さ・台帳の既定の枚数まで。/);
  assert.match(said.text, /2 行目は 1 行目に覆われて当たりません。/);
  assert.match(said.text, /3 行目の当てる物が読めません。/);
  assert.match(said.text, /起点 https:\/\/ads\.site\.test\/ は撮って辿る行に当たりません。/);
  assert.match(said.text, /起点 not a url は http\(s\) の URL ではありません。/);
  assert.match(said.text, /このままでは始められません。$/);
});

test("規則の 400 は、名指した行と起点を文の後に添える", () => {
  assert.equal(
    startAnswer(400, { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }] }).text,
    "400 —— rules that can never match: 2 行目（1 行目に覆われる）",
  );
  assert.equal(
    startAnswer(400, { error: "invalid rule patterns", rules: [{ rule: 3, pattern: "ADS.site.test" }] }).text,
    "400 —— invalid rule patterns: 3 行目（ADS.site.test）",
  );
  assert.equal(
    startAnswer(400, { error: "seeds the rules do not follow", seeds: ["https://ads.site.test/"] }).text,
    "400 —— seeds the rules do not follow: https://ads.site.test/",
  );
});
