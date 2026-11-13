/**
 * 新しいクロールの画面の部品（`public/start.js`）。送る body と、答えの言い方。
 *
 * 送る道（`POST /api/crawls` の中継）と門は http の側（`server.mjs`）に在り、門の判定は `lib.test.mjs` が見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { setLang, t } from "../public/i18n.js";
import {
  ACTIONS,
  actionText,
  addRow,
  addSkipRow,
  asTemplate,
  bodyBytes,
  checkQuery,
  askWhenSettled,
  declaredOf,
  declaredWith,
  inlineDeclared,
  defaultIds,
  hasNocheck,
  INLINE_ROW,
  keepsKey,
  keyFor,
  liveOrder,
  marksOf,
  movedOrder,
  moveRow,
  NOCHECK,
  onSeed,
  orderOf,
  plainClick,
  PRESETS,
  removeRow,
  scriptsOf,
  seedHosts,
  shownOrder,
  sizeOf,
  startAnswer,
  startBody,
  userAgentOf,
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

test("「リンクを辿る」は規則を必ず送り、深さと枚数は書いたときだけ送る（空なら capture-ledger の既定）", () => {
  const rows = [
    { action: "skip", pattern: " ads.site.test " },
    { action: "follow", pattern: "same-site" },
  ];
  const blank = startBody("https://site.test/", { maxDepth: "", maxPages: " ", rows });
  assert.deepEqual(blank, {
    seeds: ["https://site.test/"],
    // 当てる物は前後の空白だけ落とす。鍵が 1 つの object（capture-ledger の形）
    rules: [{ skip: "ads.site.test" }, { follow: "same-site" }],
  });
  const filled = startBody("https://site.test/", { maxDepth: "3", maxPages: "200", rows });
  assert.equal(filled.maxDepth, 3);
  assert.equal(filled.maxPages, 200);
});

test("URL は検査しない —— 読めない URL も、そのまま capture-ledger へ送る", () => {
  assert.deepEqual(startBody("ftp://site.test/\nnot a url", null).seeds, ["ftp://site.test/", "not a url"]);
});

test("空の欄は、空の seeds になる（workbench はこれを送らない）", () => {
  assert.deepEqual(startBody(" \n \n", null).seeds, []);
});

test("202 は始めた 1 本を、409 は塞いでいる 1 本を、決めた文で名指す", () => {
  const ok = startAnswer(202, { crawlId: "9072b625-1111-4000-8000-000000000000" });
  assert.equal(ok.kind, "ok");
  assert.equal(ok.text, "クロール開始しました（crawl 9072b625）。");
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

test("capture-ledger の句は訳し、hint があれば添える（鍵の無い hint は届いた字のまま）", () => {
  const empty = startAnswer(400, {
    error: "no scripts are registered",
    hint: "pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])",
  });
  assert.equal(empty.kind, "bad");
  assert.equal(
    empty.text,
    "400 —— 登録済みのスクリプトがありません（pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])）",
  );
  assert.equal(startAnswer(404, { error: "not found" }).text, "404 —— 見つかりません");
});

test("Fastify の答えは message を拾う —— error には \"Not Found\" しか無い", () => {
  const noRoute = startAnswer(404, {
    message: "Route POST:/api/crawls not found",
    error: "Not Found",
    statusCode: 404,
  });
  assert.equal(noRoute.text, "404 —— Route POST:/api/crawls not found");
});

test("workbench のサーバに届かなければ、そう言う", () => {
  assert.equal(startAnswer(0, { error: "Failed to fetch" }).text, "workbench 自身に届きません（Failed to fetch）");
});

/**
 * 走らせるものの欄。登録済みのスクリプトは対象サイトの無い autoscroll・autofetch の 2 本（capture-ledger の並び）で、
 * どちらも既定の顔ぶれとする（autofetch を既定から外した capture-ledger は、下の `SCRIPTS`）。
 */
const CATALOG = ["autoscroll", "autofetch"];
const NO_INLINE = { name: "", phase: "behavior", source: "" };
const LATER = { name: "close-banner", phase: "behavior", source: "x;" };
const run = (picked, inline = NO_INLINE, order = [INLINE_ROW, ...CATALOG]) => ({
  order,
  picked,
  defaults: CATALOG,
  inline,
});

test("走らせるものが既定のまま（既定の顔ぶれを全部選び、順も動かさず、その場の TS が空）なら scripts を送らない", () => {
  // capture-ledger の既定と、登録済みのスクリプトが無いときの 400 を生かす
  assert.equal("scripts" in startBody("https://site.test/", null, run(CATALOG)), false);
  // 登録済みのスクリプトが無く、その場の TS も無いときも送らない（capture-ledger が「スクリプトが無い」と言う）
  assert.equal(scriptsOf({ order: [INLINE_ROW], picked: [], defaults: [], inline: NO_INLINE }), undefined);
});

test("スクリプトを 1 つ外すと、選んだ物だけを走る順で送る", () => {
  assert.deepEqual(scriptsOf(run(["autofetch"])), [{ catalog: "autofetch" }]);
  // 押した順ではなく、走る順
  assert.deepEqual(scriptsOf(run(["autofetch", "autoscroll"], LATER)).slice(1), [
    { catalog: "autoscroll" },
    { catalog: "autofetch" },
  ]);
});

test("顔ぶれが既定のままでも、順を動かしたら scripts を送る —— 省くと capture-ledger が既定の順で走らせる", () => {
  const swapped = [INLINE_ROW, "autofetch", "autoscroll"];
  assert.deepEqual(scriptsOf(run(CATALOG, NO_INLINE, swapped)), [{ catalog: "autofetch" }, { catalog: "autoscroll" }]);
});

test("動かして元の順に戻したら、また省く", () => {
  const swapped = run(CATALOG, NO_INLINE, [INLINE_ROW, "autofetch", "autoscroll"]);
  assert.equal(scriptsOf(run(CATALOG, NO_INLINE, movedOrder(swapped, "autofetch", 1))), undefined);
});

test("動かす前の順は、その場の TS が先頭で capture-ledger の並びのまま —— capture-ledger の順が変われば付いていく", () => {
  assert.deepEqual(orderOf(undefined, ["b", "a"]), [INLINE_ROW, "b", "a"]);
  assert.deepEqual(orderOf(undefined, ["a", "b"]), [INLINE_ROW, "a", "b"]);
});

test("動かした後の順は保つ —— capture-ledger に新しく現れた id は後ろへ足し、消えた id は落とす", () => {
  const moved = ["b", INLINE_ROW, "a"];
  assert.deepEqual(orderOf(moved, ["a", "b"]), moved);
  assert.deepEqual(orderOf(moved, ["c", "a", "b"]), ["b", INLINE_ROW, "a", "c"]);
  assert.deepEqual(orderOf(moved, ["a"]), [INLINE_ROW, "a"]);
});

test("その場の TS の印は、どのスクリプトの id にもならない", () => {
  // capture-ledger の id は ^[a-z][a-z0-9-]*$（capture-ledger の POST /api/crawls）
  assert.equal(/^[a-z][a-z0-9-]*$/.test(INLINE_ROW), false);
});

test("番号の付く行は、チェックの付いたスクリプトと、読み込みの後に走るその場の TS だけ", () => {
  assert.deepEqual(liveOrder(run(["autofetch"])), ["autofetch"]);
  assert.deepEqual(liveOrder(run(["autofetch"], LATER)), [INLINE_ROW, "autofetch"]);
  // 空白だけの TS は書いていない。遷移の前に走る物は順を選べない
  assert.deepEqual(liveOrder(run(["autofetch"], { ...LATER, source: " \n\t" })), ["autofetch"]);
  assert.deepEqual(liveOrder(run(["autofetch"], { ...LATER, phase: "preload" })), ["autofetch"]);
});

test("↑↓ は隣の番号の行と入れ替える", () => {
  assert.deepEqual(movedOrder(run(CATALOG), "autofetch", -1), [INLINE_ROW, "autofetch", "autoscroll"]);
  assert.deepEqual(movedOrder(run(CATALOG), "autoscroll", 1), [INLINE_ROW, "autofetch", "autoscroll"]);
});

test("↑↓ は間の外れた行を飛ばし、外れた行はその位置に残る", () => {
  const order = [INLINE_ROW, "a", "x", "b"];
  assert.deepEqual(movedOrder({ ...run(["a", "b"]), order }, "b", -1), [INLINE_ROW, "b", "x", "a"]);
});

test("端を越えるなら同じ順を返す —— 書いていないその場の TS とは入れ替えない", () => {
  const top = run(CATALOG);
  assert.equal(movedOrder(top, "autoscroll", -1), top.order);
  assert.equal(movedOrder(top, "autofetch", 1), top.order);
});

test("その場の TS も番号の行と入れ替えられる", () => {
  assert.deepEqual(movedOrder(run(CATALOG, LATER), INLINE_ROW, 1), ["autoscroll", INLINE_ROW, "autofetch"]);
  assert.deepEqual(movedOrder(run(CATALOG, LATER), "autoscroll", -1), ["autoscroll", INLINE_ROW, "autofetch"]);
});

test("起点のホストは capture-ledger と同じく hostname —— 小文字になり、IDN は punycode になる", () => {
  assert.deepEqual([...seedHosts("HTTPS://WWW.Site.test/a\nhttps://日本.jp/")], ["www.site.test", "xn--wgv71a.jp"]);
});

test("読めない行と空行は、起点のホストに数えない（capture-ledger が 400 で言う）", () => {
  assert.deepEqual([...seedHosts(" \nnot a url\n\n https://site.test/ \n")], ["site.test"]);
  assert.equal(seedHosts("").size, 0);
});

/**
 * capture-ledger の `GET /api/scripts` の形（カタログの順）。対象サイトの無い 2 本のうち autofetch は既定に入らない（capture-scripts の
 * カタログの `default: false`）。もう 1 本は laws.e-gov.go.jp 用。
 */
const SITE = { id: "egov-law-search", sites: ["laws.e-gov.go.jp"], enabled: true };
const SCRIPTS = [{ id: "autoscroll", sites: [], enabled: true }, SITE, { id: "autofetch", sites: [], enabled: false }];
const IDS = SCRIPTS.map((script) => script.id);
const ORDER = [INLINE_ROW, ...IDS];

test("行は走る順のまま、起点に合わないサイト用の行だけ下へまとめる", () => {
  assert.deepEqual(shownOrder(ORDER, SCRIPTS, seedHosts("https://other-site.test/")), [
    INLINE_ROW,
    "autoscroll",
    "autofetch",
    "egov-law-search",
  ]);
  // 起点に合えば、走る順の位置に戻る
  assert.deepEqual(shownOrder(ORDER, SCRIPTS, seedHosts("https://laws.e-gov.go.jp/")), ORDER);
});

test("対象サイトの無いスクリプトは、起点が無くても、どの起点でも既定", () => {
  assert.deepEqual(defaultIds(SCRIPTS, new Set()), ["autoscroll"]);
  assert.deepEqual(defaultIds(SCRIPTS, seedHosts("https://other-site.test/")), ["autoscroll"]);
});

test("既定に入らないスクリプト（enabled: false）は、どの起点でも既定に数えない —— サイト用でも", () => {
  assert.equal(defaultIds(SCRIPTS, seedHosts("https://laws.e-gov.go.jp/")).includes("autofetch"), false);
  const offSite = { ...SITE, enabled: false };
  assert.deepEqual(defaultIds([SCRIPTS[0], offSite], seedHosts("https://laws.e-gov.go.jp/")), ["autoscroll"]);
});

test("サイト用のスクリプトは、起点のどれかが対象サイトのホストにあるときだけ既定 —— ポートは見ない", () => {
  assert.deepEqual(defaultIds(SCRIPTS, seedHosts("https://other-site.test/\nhttp://laws.e-gov.go.jp:8080/a")), [
    "autoscroll",
    "egov-law-search",
  ]);
  // 完全一致。同じ e-Gov でも別のホスト（www.e-gov.go.jp）は合わない
  assert.equal(onSeed(SITE, seedHosts("https://www.e-gov.go.jp/")), false);
});

test("起点に合わないサイト用のスクリプトは既定に数えない —— 残りを全部選んでいれば scripts を省く", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://other-site.test/"));
  assert.equal(scriptsOf({ order: ORDER, picked: defaults, defaults, inline: NO_INLINE }), undefined);
});

test("起点に合うサイト用のスクリプトを外したら scripts を送る —— 省くと capture-ledger が既定で入れる", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://laws.e-gov.go.jp/"));
  assert.deepEqual(scriptsOf({ order: ORDER, picked: ["autoscroll"], defaults, inline: NO_INLINE }), [
    { catalog: "autoscroll" },
  ]);
  // 付けたままなら省く（capture-ledger が同じ 2 本を選ぶ）
  assert.equal(scriptsOf({ order: ORDER, picked: ["autoscroll", "egov-law-search"], defaults, inline: NO_INLINE }), undefined);
});

test("既定に入らないスクリプトを付けたら scripts を送る —— 省くと capture-ledger は入れない", () => {
  const defaults = defaultIds(SCRIPTS, seedHosts("https://other-site.test/"));
  assert.deepEqual(scriptsOf({ order: ORDER, picked: ["autofetch", "autoscroll"], defaults, inline: NO_INLINE }), [
    { catalog: "autoscroll" },
    { catalog: "autofetch" },
  ]);
});

test("全部外すと scripts: [] を送る —— 何も走らせない", () => {
  assert.deepEqual(startBody("https://site.test/", null, run([])).scripts, []);
});

test("その場の TS は、名前・phase・source を送る（source は削らない）", () => {
  const source = "\n(() => {\n  void 0;\n})();\n\n";
  const body = startBody("https://site.test/", null, run(CATALOG, { name: " close-banner ", phase: "preload", source }));
  assert.deepEqual(body.scripts[0], { inline: { name: "close-banner", phase: "preload", source } });
});

test("読み込みの後に走るその場の TS は、順の中の位置で送る", () => {
  const inline = { inline: LATER };
  assert.deepEqual(scriptsOf(run(CATALOG, LATER)), [inline, { catalog: "autoscroll" }, { catalog: "autofetch" }]);
  assert.deepEqual(scriptsOf(run(CATALOG, LATER, ["autoscroll", INLINE_ROW, "autofetch"])), [
    { catalog: "autoscroll" },
    inline,
    { catalog: "autofetch" },
  ]);
});

test("遷移の前に走るその場の TS は、順の中の位置によらず先頭に送る", () => {
  const preload = { ...LATER, phase: "preload" };
  assert.deepEqual(scriptsOf(run(CATALOG, preload, ["autoscroll", "autofetch", INLINE_ROW])), [
    { inline: preload },
    { catalog: "autoscroll" },
    { catalog: "autofetch" },
  ]);
});

test("空白だけの TS は送らない", () => {
  assert.equal(scriptsOf(run(CATALOG, { name: "x", phase: "behavior", source: " \n\t" })), undefined);
});

test("名前の綴りは検査しない —— 読めない名前も、そのまま capture-ledger へ送る", () => {
  const body = startBody("https://site.test/", null, run(CATALOG, { name: "Close_Banner", phase: "behavior", source: "x;" }));
  assert.equal(body.scripts[0].inline.name, "Close_Banner");
});

test("capture-ledger が名指した ids を、文の後に添える", () => {
  assert.equal(
    startAnswer(400, { error: "unknown script ids", ids: ["typo-scroll"] }).text,
    "400 —— 知らないスクリプトの id です: typo-scroll",
  );
  assert.equal(
    startAnswer(400, { error: "duplicate script ids", ids: ["inline-a", "autofetch"] }).text,
    "400 —— スクリプトの id が重なっています: inline-a, autofetch",
  );
});

// ── クロールごとの値（変数とシークレット。capture-ledger v0.67.0）────────────

/** capture-ledger の `GET /api/scripts` の 1 行が運ぶ宣言（capture-scripts の catalog.json の `params`）。 */
const QUERY = { name: "query", kind: "variable", required: false, summary: "法令名の検索語。省けばソースの既定" };
const TOKEN = { name: "api_token", kind: "secret", required: true, summary: "会員 API のトークン" };
const DECLARING = [
  // 宣言を運ばない capture-ledger（v0.66 まで）の行には params が無い
  { id: "autoscroll", sites: [], enabled: true },
  { id: "egov-law-search", sites: ["laws.e-gov.go.jp"], enabled: true, params: [QUERY] },
  { id: "member-pages", sites: [], enabled: false, params: [TOKEN, { ...QUERY, required: true, summary: "別の説明" }] },
];

test("宣言はチェックしたスクリプトの物だけを capture-ledger の並びで集め、同じ名前は 1 つにまとめる（必須はどれかが必須なら必須）", () => {
  assert.deepEqual(declaredOf(DECLARING, ["egov-law-search"], "variable"), [
    { name: "query", required: false, summary: QUERY.summary, by: ["egov-law-search"] },
  ]);
  assert.deepEqual(declaredOf(DECLARING, ["egov-law-search", "member-pages"], "variable"), [
    { name: "query", required: true, summary: QUERY.summary, by: ["egov-law-search", "member-pages"] },
  ]);
  assert.deepEqual(declaredOf(DECLARING, ["member-pages"], "secret"), [
    { name: "api_token", required: true, summary: TOKEN.summary, archive: null, by: ["member-pages"] },
  ]);
  // params を運ばない行と、チェックを外した物は何も宣言しない
  assert.deepEqual(declaredOf(DECLARING, ["autoscroll"], "variable"), []);
  assert.deepEqual(declaredOf(DECLARING, [], "secret"), []);
});

test("値の形（schema）は最初の宣言の物を運ぶ。schema の無い宣言には鍵が無い", () => {
  const LEVEL = { name: "level", kind: "variable", required: true, schema: { type: "string", enum: ["low", "high"] } };
  const scripts = [
    { id: "a", sites: [], params: [LEVEL] },
    { id: "b", sites: [], params: [{ ...LEVEL, schema: { type: "string" } }] },
  ];
  assert.deepEqual(declaredOf(scripts, ["a", "b"], "variable"), [
    { name: "level", required: true, summary: "", schema: LEVEL.schema, by: ["a", "b"] },
  ]);
  assert.equal("schema" in declaredOf(DECLARING, ["egov-law-search"], "variable")[0], false);
});

test("シークレットの宣言は WARC に残すか（archive）を運ぶ —— 省けば null（隠す）、keep はそのまま。最初の宣言の物で、変数には鍵が無い", () => {
  const LOGIN = { name: "login", kind: "secret", required: false, summary: "ログイン名", archive: "keep" };
  const scripts = [
    { id: "a", sites: [], params: [TOKEN, LOGIN] },
    // 同じ名前を、残すかどうかを違えて宣言している。ここでは断らない（capture-ledger が 400 conflicting params で言う）
    { id: "b", sites: [], params: [{ ...TOKEN, archive: "keep" }, { ...LOGIN, archive: undefined }, QUERY] },
  ];
  assert.deepEqual(declaredOf(scripts, ["a", "b"], "secret"), [
    { name: "api_token", required: true, summary: TOKEN.summary, archive: null, by: ["a", "b"] },
    { name: "login", required: false, summary: LOGIN.summary, archive: "keep", by: ["a", "b"] },
  ]);
  assert.deepEqual(declaredOf(scripts, ["b"], "secret").map((s) => [s.name, s.archive]), [
    ["api_token", "keep"],
    ["login", null],
  ]);
  assert.equal("archive" in declaredOf(scripts, ["b"], "variable")[0], false);
});

const typedInline = (source, phase = "behavior") => ({ name: "search", phase, source });

test("欄に出す宣言は、その場の TS の宣言が先で、チェックした物が続く。同じ名前は 1 つにまとめる", () => {
  const WORD = { name: "word", kind: "variable", required: true, summary: "語" };
  assert.deepEqual(declaredWith(DECLARING, ["egov-law-search"], typedInline("x;"), [WORD], "variable"), [
    { name: "word", required: true, summary: "語", by: ["@inline"] },
    { name: "query", required: false, summary: QUERY.summary, by: ["egov-law-search"] },
  ]);
  // 下敷きで写して元のチェックを残したとき: 同じ名前は 1 行で、必須はどちらかが必須なら必須
  assert.deepEqual(
    declaredWith(DECLARING, ["egov-law-search"], typedInline("x;"), [{ ...QUERY, required: true }], "variable"),
    [{ name: "query", required: true, summary: QUERY.summary, by: ["@inline", "egov-law-search"] }],
  );
  // シークレットの種類を訊いても変数は混ざらない
  assert.deepEqual(declaredWith(DECLARING, [], typedInline("x;"), [WORD], "secret"), []);
});

test("箱が空なら、前の答えの宣言を出さない —— 消した TS の欄と値を残さない", () => {
  const WORD = { name: "word", kind: "variable", required: true };
  assert.deepEqual(declaredWith(DECLARING, [], typedInline(""), [WORD], "variable"), []);
  assert.deepEqual(declaredWith(DECLARING, [], typedInline(" \n "), [WORD], "variable"), []);
  assert.deepEqual(variablesOf(declaredWith(DECLARING, [], typedInline(""), [WORD], "variable"), new Map([["word", "x"]])), {});
  assert.deepEqual(variablesOf(declaredWith(DECLARING, [], typedInline("x;"), [WORD], "variable"), new Map([["word", "x"]])), {
    word: "x",
  });
});

test("宣言の答えは、欄の宣言と、欄が出ない理由の 1 行になる —— ふつうの型の誤りは言わない", () => {
  const PARAM = { name: "word", kind: "variable", required: true };
  assert.deepEqual(inlineDeclared(200, { params: [PARAM], diagnostics: [] }), { params: [PARAM], note: "" });
  assert.deepEqual(
    inlineDeclared(200, { params: [PARAM], diagnostics: [{ code: "TS2322", message: "型が違う" }] }),
    { params: [PARAM], note: "" },
  );
  assert.deepEqual(
    inlineDeclared(200, {
      params: [],
      diagnostics: [
        { code: "BH0002", message: "z.number は読めない (値は文字列だけ)" },
        { code: "TS2322", message: "型が違う" },
        { code: "BH0004", message: "preload では defineParams を使えない (受け皿が無い)" },
      ],
    }),
    {
      params: [],
      note: "BH0002: z.number は読めない (値は文字列だけ) ／ BH0004: preload では defineParams を使えない (受け皿が無い)",
    },
  );
  assert.deepEqual(inlineDeclared(503, { error: "ts-compile unreachable" }), {
    params: [],
    note: "宣言を確かめられません（503 —— ts-compile-service に届きません）",
  });
  // エンドポイントを出していない capture-ledger（Fastify の文）。本文の形が違う 200 も、読めたことにしない
  assert.equal(
    inlineDeclared(404, { error: "Not Found", message: "Route POST:/api/scripts/check not found" }).note,
    "宣言を確かめられません（404 —— Route POST:/api/scripts/check not found）",
  );
  assert.deepEqual(inlineDeclared(200, {}), { params: [], note: "宣言を確かめられません（200 —— 答えに文がありません）" });
  assert.deepEqual(inlineDeclared(0, { error: "fetch failed" }), { params: [], note: "workbench 自身に届きません（fetch failed）" });
});

/** `askWhenSettled` を偽の答えで組む。`release()` で走行中の 1 本に答える。 */
const settling = (t, start = "") => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const state = { box: start, asked: [], answers: [], release: undefined };
  state.changed = askWhenSettled({
    current: () => state.box,
    ask: (asked) => {
      state.asked.push(asked);
      return new Promise((resolve) => {
        state.release = () => resolve(`答え ${asked}`);
      });
    },
    answered: (answer) => state.answers.push(answer),
  });
  state.settle = async () => {
    state.release();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return state;
};

test("箱が 800 ms 止まってから 1 度だけ訊く —— 変わるたびに待ち直す", async (t) => {
  const state = settling(t);
  state.box = "a";
  state.changed();
  t.mock.timers.tick(799);
  state.box = "ab";
  state.changed();
  t.mock.timers.tick(799);
  assert.deepEqual(state.asked, []);
  t.mock.timers.tick(1);
  assert.deepEqual(state.asked, ["ab"]);
  await state.settle();
  assert.deepEqual(state.answers, ["答え ab"]);
});

test("走行中は 1 本だけ。答えが前の箱の物なら捨て、待ち直して今の箱を訊く", async (t) => {
  const state = settling(t);
  state.box = "a";
  state.changed();
  t.mock.timers.tick(800);
  state.box = "ab";
  state.changed();
  t.mock.timers.tick(800);
  assert.deepEqual(state.asked, ["a"], "走行中は送らない");
  await state.settle();
  assert.deepEqual(state.answers, [], "前の箱の答えは描かない");
  assert.deepEqual(state.asked, ["a"], "答えが来てもすぐには送らない");
  t.mock.timers.tick(800);
  assert.deepEqual(state.asked, ["a", "ab"]);
  await state.settle();
  assert.deepEqual(state.answers, ["答え ab"]);
});

test("訊いている間に箱が元へ戻れば、その答えは今の箱の物", async (t) => {
  const state = settling(t);
  state.box = "a";
  state.changed();
  t.mock.timers.tick(800);
  state.box = "ab";
  state.changed();
  state.box = "a";
  state.changed();
  await state.settle();
  assert.deepEqual(state.answers, ["答え a"]);
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

test("変数とシークレットの 400 は、capture-ledger が名指した名前（シークレットは Windmill の path も）を文の後に添える", () => {
  assert.equal(startAnswer(400, { error: "missing variables", names: ["query"] }).text, "400 —— 必須の変数が渡されていません: query");
  assert.equal(
    startAnswer(400, { error: "unknown variables", names: ["qeury", "waitms"] }).text,
    "400 —— 知らない変数です: qeury, waitms",
  );
  assert.equal(
    startAnswer(400, {
      error: "unknown secrets",
      secrets: [{ name: "api_token", path: "f/waggle_secrets/api_token", declaredBy: ["inline-probe"] }],
      hint: "wmill variable add f/waggle_secrets/api_token --value … --secret",
    }).text,
    "400 —— Windmill に無いシークレットです: api_token（f/waggle_secrets/api_token）" +
      "（wmill variable add f/waggle_secrets/api_token --value … --secret）",
  );
  assert.equal(
    startAnswer(400, { error: "not a secret variable", secrets: [{ name: "api_token" }] }).text,
    "400 —— Windmill の変数が secret ではありません: api_token",
  );
  assert.equal(
    startAnswer(400, { error: "secrets cannot be passed as variables", names: ["api_token"] }).text,
    "400 —— シークレットは変数として渡せません: api_token",
  );
  // 宣言の形が読めないその場の TS は、id と理由（hint）
  assert.equal(
    startAnswer(400, { error: "invalid params", script: "inline-probe", hint: "同じ名前が 2 度: q" }).text,
    "400 —— params の宣言を読めません: inline-probe（同じ名前が 2 度: q）",
  );
  assert.equal(startAnswer(503, { error: "windmill unreachable" }).text, "503 —— Windmill に届きません");
});

test("シークレットの 400（capture-ledger v0.90.0）: 残すかの食い違いは名前を、隠せない形式は名前と hint を添える —— 形式は hint の中", () => {
  // 本文は capture-ledger の src/crawl/values.ts の checkValues と formatsRefusal の形
  assert.equal(
    startAnswer(400, { error: "conflicting params", names: ["api_token"] }).text,
    "400 —— 同じ名前の宣言が食い違っています: api_token",
  );
  const refused = startAnswer(400, {
    error: "formats that cannot hide secrets",
    formats: ["png", "html"],
    names: ["api_token", "session"],
    hint:
      "CAPTURE_LEDGER_CAPTURE_FORMATS の png・html は値を置き換えられない (BrowserHive が断る)。" +
      '形式から外すか、値を WARC に残すなら宣言に archive: "keep" と書く',
  });
  assert.equal(refused.kind, "bad");
  assert.equal(
    refused.text,
    "400 —— いまの形式では隠せないシークレットがあります: api_token, session" +
      "（CAPTURE_LEDGER_CAPTURE_FORMATS の png・html は値を置き換えられない (BrowserHive が断る)。" +
      '形式から外すか、値を WARC に残すなら宣言に archive: "keep" と書く）',
  );
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

test("行数は TS の行で、空の箱は 0 行", () => {
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

test("型はどれも「撮って辿る」を 1 本持つ —— 起点が当たらないと capture-ledger が 400 で断る", () => {
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
  // 広い「撮って辿る」の下に置くと覆われる（capture-ledger が 400 で断る）ので、上に入れる
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
  // 当てる物の : と ? と = は、capture-ledger が最初の : で切るので崩れない
  assert.deepEqual(params.getAll("rule"), ["skip:https://www.site.test/search?q=1", "follow:same-site"]);
});

/** capture-ledger の確かめのエンドポイントの答え（capture-ledger v0.62.0 の形）。 */
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

test("深さと枚数が空なら capture-ledger の既定と言い、始められない理由を最後に並べる", () => {
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
  assert.match(said.text, /既定の深さ・既定の枚数まで。/);
  assert.match(said.text, /2 行目は 1 行目に覆われて当たりません。/);
  assert.match(said.text, /3 行目の当てる物が読めません。/);
  assert.match(said.text, /起点 https:\/\/ads\.site\.test\/ は撮って辿る行に当たりません。/);
  assert.match(said.text, /起点 not a url は http\(s\) の URL ではありません。/);
  assert.match(said.text, /このままでは始められません。$/);
});

test("規則の 400 は、名指した行と起点を文の後に添える", () => {
  assert.equal(
    startAnswer(400, { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }] }).text,
    "400 —— 当たることのない規則があります: 2 行目（1 行目に覆われる）",
  );
  assert.equal(
    startAnswer(400, { error: "invalid rule patterns", rules: [{ rule: 3, pattern: "ADS.site.test" }] }).text,
    "400 —— 読めない規則があります: 3 行目（ADS.site.test）",
  );
  assert.equal(
    startAnswer(400, { error: "seeds the rules do not follow", seeds: ["https://ads.site.test/"] }).text,
    "400 —— 規則が辿らない起点があります: https://ads.site.test/",
  );
});

// ── User-Agent の箱 ──────────────────────────────

test("User-Agent の箱: 貼ったときの改行は空白に、前後の空白は落とす", () => {
  assert.equal(userAgentOf("Mozilla/5.0 (X11)\n  Chrome/156 BrowserHive"), "Mozilla/5.0 (X11) Chrome/156 BrowserHive");
  assert.equal(userAgentOf("  {chrome} BrowserHive \n"), "{chrome} BrowserHive");
  assert.equal(userAgentOf(" \n "), "");
});

test("User-Agent の箱が空なら鍵ごと送らず、今までと同じ本文。書けば鍵に載る（{chrome} は解かない）", () => {
  const empty = startBody("https://site.test/", null);
  assert.deepEqual(startBody("https://site.test/", null, undefined, {}, " \n "), empty);
  assert.equal("userAgent" in empty, false);
  assert.equal(startBody("https://site.test/", null, undefined, {}, "{chrome} BrowserHive").userAgent, "{chrome} BrowserHive");
});

test("始める要求の鍵は、同じ本文なら同じ鍵を使い回す —— 応答が切れた後の押し直しで 2 本目を始めない", () => {
  let n = 0;
  const make = () => `k${String((n += 1))}`;
  const first = keyFor(undefined, '{"seeds":["https://a.test/"]}', make);
  assert.equal(first.key, "k1");
  // 答えが届かなかった（0）ので持ったまま、もう 1 回押した
  assert.equal(keepsKey(0), true);
  assert.equal(keyFor(first, '{"seeds":["https://a.test/"]}', make).key, "k1");
  // 欄を直してから押した → 本文が違うので新しい鍵（同じ鍵の違う本文は capture-ledger が 422 で断る）
  assert.equal(keyFor(first, '{"seeds":["https://b.test/"]}', make).key, "k2");
});

test("確かな答え（202・4xx）の後は鍵を捨て、届いたか分からない間（0・5xx）だけ持つ", () => {
  for (const status of [202, 400, 401, 409, 422]) assert.equal(keepsKey(status), false, String(status));
  for (const status of [0, 500, 502, 503]) assert.equal(keepsKey(status), true, String(status));
});

// ── 英語の字（辞書の en。CAPTURE-294）──────────────────────────────

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

test("英語: 動きの名前は、引くときの言語で決まる（読み込みのときに字を作らない）。知らない動きは届いた字のまま", () => {
  assert.deepEqual(ACTIONS.map((action) => [action, actionText(action)]), [
    ["follow", "撮って辿る"],
    ["capture", "撮るだけ"],
    ["skip", "落とす"],
  ]);
  assert.deepEqual(inEnglish(() => ACTIONS.map(actionText)), ["Capture and follow", "Capture only", "Drop"]);
  assert.equal(actionText("pause"), "pause");
});

test("英語: 確かめの文は 1 つの文で言い、段と枚は単数と複数を分ける", () => {
  assert.equal(
    inEnglish(() => summaryOf(ANSWER, FOLLOW).text),
    "Rows are tried from the top: row 1 drops URLs that start with https://www.site.test/search, " +
      "row 2 captures and follows within site.test, row 3 only captures anywhere. " +
      "Links that match no row are dropped. Up to 3 levels and 200 pages.",
  );
  const limits = (maxDepth, maxPages) => inEnglish(() => summaryOf({ seeds: [], rules: [] }, { maxDepth, maxPages, rows: [] }).text);
  assert.equal(limits("1", "1"), "There are no rules. Up to 1 level and 1 page.");
  assert.equal(limits("2", "2"), "There are no rules. Up to 2 levels and 2 pages.");
  assert.equal(limits("1", ""), "There are no rules. Up to 1 level and the default number of pages.");
  assert.equal(limits("", ""), "There are no rules. Up to the default depth and the default number of pages.");
});

test("英語: 始められない理由と行ごとの印", () => {
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
  const said = inEnglish(() => summaryOf(answer, { maxDepth: "", maxPages: "", rows: [] }));
  assert.equal(said.bad, true);
  assert.match(said.text, /row 2 drops ads\.site\.test and its subdomains, row 3 drops "\*\.site\.test" \(cannot be read\)\. /);
  assert.match(said.text, / Row 2 is covered by row 1 and never matches\. What row 3 matches cannot be read\. /);
  assert.match(said.text, / The seed https:\/\/ads\.site\.test\/ does not match a "Capture and follow" row\. /);
  assert.match(said.text, / The seed not a url is not an http\(s\) URL\. The crawl cannot be started as it is\.$/);
  assert.deepEqual(inEnglish(() => marksOf(answer, 3)), [
    { text: "scope", bad: false },
    { text: "Covered by row 1; never matches. Move it up", bad: true },
    { text: "Cannot be read (write a lowercase host name, an http(s) URL or the name of a scope)", bad: true },
  ]);
});

test("英語: 始めた答え —— capture-ledger の句は辞書で訳し、鍵の無い hint は届いた字のまま", () => {
  const answer = (status, body) => inEnglish(() => startAnswer(status, body).text);
  assert.equal(answer(202, { crawlId: "9072b625-1111-4000-8000-000000000000" }), "Crawl started (crawl 9072b625).");
  assert.equal(answer(409, {}), "A crawl is running. The next one cannot start until it ends.");
  assert.equal(
    answer(400, { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }, { rule: 3, pattern: "ADS.site.test" }] }),
    "400 — Rules that can never match: row 2 (covered by row 1), row 3 (ADS.site.test)",
  );
  assert.equal(
    answer(400, { error: "unknown secrets", secrets: [{ name: "api_token", path: "f/waggle_secrets/api_token" }], hint: "wmill variable add" }),
    "400 — Unknown secrets: api_token (f/waggle_secrets/api_token) (wmill variable add)",
  );
  assert.equal(answer(0, {}), "The workbench itself cannot be reached (The answer has no message)");
  assert.equal(
    inEnglish(() => inlineDeclared(503, { error: "ts-compile unreachable" }).note),
    "Cannot check the declarations (503 — ts-compile-service cannot be reached)",
  );
});

test("大きさの行: 数は桁を区切り、英語は行とバイトの単数と複数を分ける", () => {
  assert.equal(t("start.size.lineOfLimit", { lines: 4, bytes: 270, percent: 0 }), "4 行 · 本文 270 バイト · 上限の 0%");
  assert.equal(t("start.size.line", { lines: 1234, bytes: 56789 }), "1,234 行 · 本文 56,789 バイト");
  assert.equal(
    t("start.size.over", { limit: 1048576, over: 1234 }),
    "本文が上限（1,048,576 バイト）を 1,234 バイト超えています。始められません",
  );
  const line = (lines, bytes) => inEnglish(() => t("start.size.line", { lines, bytes }));
  assert.equal(line(1, 1), "1 line · body 1 byte");
  assert.equal(line(2, 1234), "2 lines · body 1,234 bytes");
  assert.equal(line(0, 0), "0 lines · body 0 bytes");
  const over = (n) => inEnglish(() => t("start.size.over", { limit: 1048576, over: n }));
  assert.equal(over(1), "The body is 1 byte over the limit (1,048,576 bytes). The crawl cannot be started");
  assert.equal(over(2), "The body is 2 bytes over the limit (1,048,576 bytes). The crawl cannot be started");
});
