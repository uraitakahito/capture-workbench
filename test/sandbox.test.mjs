/**
 * サンドボックスの代役 (sandbox/fake-ledger.mjs) の、応答を組み立てる部分。
 *
 * 欄の集合を台帳の応答と揃えておくことと、同梱の台本が画面の状態を全部出せることを固定する。
 * 台帳の欄は capture-ledger v0.57.4 から写した —— 台帳が欄を足したら、ここと代役を直す。
 * スクリプトを読む口（版の一覧・1 版・受け皿の型）は v0.60.0 から、札（`sites`）と起点で選ぶ既定は v0.61.0 から。
 * 規則の並び（`rules`・400 の 3 つ・確かめの口・判断の口）は v0.62.0 から。既定に入らないスクリプト（一覧の
 * `enabled`・名指しは有効かどうかを見ない）は v0.64.0 から。クロールごとの値（版の `params`・頼みの `variables`・
 * 行の `variables`/`secrets`・値の 400 の 4 つ）は v0.67.0 から。ページの口（`GET /api/crawls/:id/pages` と
 * `…/pages/:page/log`）と failures の `page` は、CAPTURE-18 で台帳が足す形から（台帳の版は、口が出たら書く）。
 * 型の誤りの取り直し（`GET /api/crawls/:id/diagnostics`）と直し方（`POST …/inline/:name/fix`）は CAPTURE-49 の形から。
 * 合本の欄（行と詳しい所の `replayBundle`・ページの行の `capturedAt` と `bundledRev`）は、CAPTURE-56 で台帳が足す形から
 * （台帳の版は、出たら書く）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stateOf } from "../public/format.js";
import { outcomeOf } from "../public/pages.js";
import { replayBundleHref } from "../public/replay.js";
import { diagnosisOf, failedOnTypes, fixAnswer, hasErrorsIn } from "../public/fix.js";
import { asTemplate, defaultIds, seedHosts } from "../public/start.js";
import {
  archiveRows,
  catalogOf,
  crawlDetail,
  crawlRow,
  crawlRulesCheck,
  decisionsOf,
  defaultSet,
  diagnosticsOf,
  fixOf,
  hostTypesOf,
  idOf,
  inlineSource,
  latestEnabled,
  pageList,
  pageLog,
  pageRow,
  pickable,
  readingLastGood,
  replayBundleOf,
  scriptRows,
  searchOf,
  signedUrlOf,
  submitCrawl,
  submittedRow,
  versionOf,
  versionsOf,
} from "../sandbox/fake-ledger.mjs";

const scenario = JSON.parse(readFileSync(new URL("../sandbox/scenario.json", import.meta.url), "utf8"));
/** 台本のスクリプト（版の並び。source は sandbox/catalog の写し —— capture-scripts のファイル）。 */
const versions = catalogOf(scenario);
/** 版を `id@版` で並べる（既定の顔ぶれ・走らせたものを 1 行で比べる）。 */
const at = (list) => list.map((v) => `${v.id}@${String(v.version)}`);
const NOW = Date.parse("2026-10-12T12:00:00.000Z");

/** capture-ledger の src/api/crawls.ts が /api/crawls の 1 行に返す欄 (v0.57.4。`replayBundle` は CAPTURE-56 から)。 */
const LEDGER_CRAWL_KEYS = [
  "crawlId",
  "state",
  "stopReason",
  "seeds",
  "requestedBy",
  "orgId",
  "startedAt",
  "finishedAt",
  "pagesDiscovered",
  "pagesCaptured",
  "error",
  "waczCount",
  "lastJob",
  "replayBundle",
].sort();
/** 行と詳しい所の `replayBundle` の欄（null でなければ。CAPTURE-56 の src/api/crawls.ts の replayBundleOf）。 */
const LEDGER_BUNDLE_KEYS = ["key", "rev", "pages", "builtAt", "error"].sort();

/** capture-ledger の src/api/routes.ts が /api/archives の 1 行に返す欄 (v0.57.4)。 */
const LEDGER_ARCHIVE_KEYS = [
  "id",
  "taskId",
  "sourceUrl",
  "labels",
  "waczComplete",
  "capturedAt",
  "objectKey",
].sort();

test("クロールの 1 行は、台帳の /api/crawls と同じ欄を持つ", () => {
  for (const c of scenario.crawls) {
    assert.deepEqual(Object.keys(crawlRow(c, NOW)).sort(), LEDGER_CRAWL_KEYS, c.crawlId);
  }
});

// ── 始める口（POST /api/crawls）。文は capture-ledger v0.57.5 の src/api/crawls.ts から写した ──

const RUNS = 15;

test("始めると 202 で、受けた行が走行中として先頭に出る", () => {
  // 台本には走行中の行が在るが、受けた行だけで数えるので塞がない
  assert.ok(scenario.crawls.some((c) => c.state === "running"));
  const rows = [];
  const answer = submitCrawl(rows, { seeds: ["https://site.test/"], maxDepth: 0 }, NOW, RUNS, versions);
  assert.equal(answer.status, 202);
  assert.deepEqual(Object.keys(answer.body), ["crawlId"]);
  assert.equal(rows[0].crawlId, answer.body.crawlId);
  const row = submittedRow(rows[0], NOW + 1000);
  assert.equal(row.state, "running");
  assert.equal(row.finishedAt, null);
  assert.equal(row.startedAt, "2026-10-12T12:00:00.000Z");
});

test("走っている間の 2 本目は 409 で、塞いでいる行を名指す", () => {
  const rows = [];
  const first = submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions);
  const second = submitCrawl(rows, { seeds: ["https://other-site.test/"] }, NOW + 5000, RUNS, versions);
  assert.equal(second.status, 409);
  assert.deepEqual(second.body, {
    error: "a crawl is already in progress",
    crawlId: first.body.crawlId,
    startedAt: "2026-10-12T12:00:00.000Z",
  });
  assert.equal(rows.length, 1, "断った本は行にしない");
});

test("runsSeconds を過ぎると完走になり、次を受ける", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/", "https://site.test/docs/"] }, NOW, RUNS, versions);
  const done = submittedRow(rows[0], NOW + RUNS * 1000);
  assert.equal(done.state, "succeeded");
  assert.equal(done.stopReason, "completed");
  assert.equal(done.finishedAt, "2026-10-12T12:00:15.000Z");
  assert.equal(done.pagesCaptured, 2);
  assert.equal(stateOf(done).text, "完走");
  const next = submitCrawl(rows, { seeds: ["https://other-site.test/"] }, NOW + RUNS * 1000, RUNS, versions);
  assert.equal(next.status, 202);
  assert.equal(rows[0].crawlId, next.body.crawlId, "新しい順の先頭");
});

test("読めない起点・空の起点・seeds の無い body は、台帳と同じ文で 400", () => {
  const rows = [];
  const say = (body) => submitCrawl(rows, body, NOW, RUNS, versions);
  assert.deepEqual(say({}), { status: 400, body: { error: "provide exactly one of seeds or fromTargets" } });
  assert.deepEqual(say({ seeds: [] }), { status: 400, body: { error: "seeds must not be empty" } });
  for (const seed of ["ftp://site.test/", "not a url", "site.test"]) {
    assert.deepEqual(say({ seeds: ["https://site.test/", seed] }), {
      status: 400,
      body: { error: "every seed must be an http(s) URL" },
    });
  }
  assert.equal(rows.length, 0, "断った本は行にしない");
});

test("受けた行も、台帳の /api/crawls と同じ欄を持つ", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions);
  assert.deepEqual(Object.keys(submittedRow(rows[0], NOW)).sort(), LEDGER_CRAWL_KEYS);
  assert.deepEqual(Object.keys(submittedRow(rows[0], NOW + RUNS * 1000)).sort(), LEDGER_CRAWL_KEYS);
});

test("時刻は台本の何秒前から組み、走行中は終わりが無い", () => {
  const running = crawlRow({ crawlId: "r", state: "running", seeds: [], startedSecondsAgo: 40 }, NOW);
  assert.equal(running.startedAt, "2026-10-12T11:59:20.000Z");
  assert.equal(running.finishedAt, null);

  const done = crawlRow(
    { crawlId: "d", state: "succeeded", stopReason: "completed", seeds: [], startedSecondsAgo: 900, tookSeconds: 75 },
    NOW,
  );
  assert.equal(done.startedAt, "2026-10-12T11:45:00.000Z");
  assert.equal(done.finishedAt, "2026-10-12T11:46:15.000Z");
});

test("同梱の台本は、画面の状態の言い分けを全部出す", () => {
  // 言い分けの規則は public/format.js の stateOf。サンドボックスは、その全部の枝を画面に出すためにある
  const texts = new Set(scenario.crawls.map((c) => stateOf(crawlRow(c, NOW)).text));
  for (const text of ["走行中", "完走", "打ち切り (深さ)", "打ち切り (枚数)", "失敗"]) {
    assert.ok(texts.has(text), text);
  }
  assert.ok([...texts].some((text) => text.startsWith("成功 (")), "知らない stopReason の行");
  assert.ok((scenario.hidden ?? []).length > 0, "見えない archive の行");
});

// ── 合本の欄（CAPTURE-56 で台帳が足す行の replayBundle）────────────────────────────────

test("合本の欄は台帳と同じ形で、行と詳しい所で同じ。鍵は台帳と同じ置き場の版を指す", () => {
  let seen = 0;
  for (const c of scenario.crawls) {
    const bundle = crawlRow(c, NOW).replayBundle;
    assert.deepEqual(crawlDetail(c).replayBundle, bundle, c.crawlId);
    if (bundle === null) continue;
    seen += 1;
    assert.deepEqual(Object.keys(bundle).sort(), LEDGER_BUNDLE_KEYS, c.crawlId);
    if (bundle.rev === null) {
      // 失敗だけの行は、鍵・ページの数・時刻を持たない（台帳の replayBundleOf と同じ）
      assert.deepEqual([bundle.key, bundle.pages, bundle.builtAt], [null, null, null], c.crawlId);
      assert.equal(typeof bundle.error, "string", c.crawlId);
    } else {
      assert.equal(bundle.key, `org/acme/crawls/${c.crawlId}/r${String(bundle.rev)}/replay.json`, c.crawlId);
      assert.equal(typeof bundle.pages, "number", c.crawlId);
      assert.ok(Date.parse(bundle.builtAt) > 0, c.crawlId);
    }
  }
  assert.ok(seen > 0);
  // 書けた版も失敗も無い行は null
  assert.equal(replayBundleOf({ crawlId: "x", replayBundle: {} }), null);
});

test("同梱の台本は、合本の 3 つの形（書けた版・書けた版の後の失敗・失敗だけ）と、合本の無い行を出す。受けた行は持たない", () => {
  const bundles = scenario.crawls.map((c) => crawlRow(c, NOW).replayBundle);
  assert.ok(bundles.some((b) => b?.key && b.error === null), "書けた版");
  assert.ok(bundles.some((b) => b?.key && b.error !== null), "書けた版の後の失敗（前の版を開く）");
  assert.ok(bundles.some((b) => b !== null && b.key === null), "失敗だけ（replay ↗ が出ない）");
  assert.ok(bundles.some((b) => b === null), "合本の無い行");
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions);
  assert.equal(submittedRow(rows[0], NOW).replayBundle, null);
  assert.equal(crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts).replayBundle, null);
});

test("台本が少しの間だけ読めないときは、前に読めた台本で答える", () => {
  let t = 0;
  let broken;
  const read = readingLastGood(
    () => {
      if (broken !== undefined) throw broken;
      return { at: t };
    },
    3000,
    () => t,
  );
  assert.deepEqual(read(), { at: 0 });

  broken = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
  t = 1000;
  assert.deepEqual(read(), { at: 0 }, "置き換えの直後");
  t = 3999;
  assert.deepEqual(read(), { at: 0 }, "読めなくなってから 3 秒未満");
  t = 4000;
  assert.throws(read, /ENOENT/, "読めないのが続いたら投げる (書き損じを赤い文で言う)");

  broken = undefined;
  t = 5000;
  assert.deepEqual(read(), { at: 5000 }, "読めたら新しい台本");
});

test("1 度も読めていない台本は、待たずに投げる", () => {
  const read = readingLastGood(
    () => JSON.parse("{"),
    3000,
    () => 0,
  );
  assert.throws(read, SyntaxError);
});

test("同梱の台本の crawlId は、画面が出す頭の 8 字で見分けられる", () => {
  // 画面の id の欄は crawlId の頭の 8 字 (public/app.js)。頭が揃うと、全部の行が同じ id に見える
  const heads = scenario.crawls.map((c) => c.crawlId.slice(0, 8));
  assert.equal(new Set(heads).size, heads.length, heads.join(" "));
});

test("クロール 1 本は、dashboard が読む seeds・error・scripts・failures を返す", () => {
  const failed = scenario.crawls.find((c) => c.state === "failed" && c.failures?.length > 0);
  const detail = crawlDetail(failed);
  assert.deepEqual(detail.seeds, failed.seeds);
  assert.equal(detail.error, failed.error);
  assert.ok(detail.failures.length > 0);
  // 走らせたものを持たない行は、空の並び（台帳も、何も走らせなければ []）
  assert.deepEqual(detail.scripts, []);
});

test("同梱の台本に、その場の JS で完走した行と、compile の段で落ちた行が在る", () => {
  const withInline = scenario.crawls.filter((c) => c.scripts?.some((s) => s.inline !== undefined));
  assert.deepEqual([...new Set(withInline.map((c) => c.state))].sort(), ["failed", "succeeded"]);
  assert.equal(withInline.filter((c) => c.state === "failed").length, 1, "compile の段で落ちた行は 1 本");
  const broken = crawlDetail(withInline.find((c) => c.state === "failed"));
  assert.match(broken.error, /compile 422 .*inline-close-banner\.ts/);
  // 台帳と同じく、その場の物にだけ inline が付き、台帳のスクリプトは身元だけ
  assert.equal(broken.scripts[0].id, "inline-close-banner");
  assert.equal(broken.scripts[0].inline.name, "close-banner");
  assert.equal("inline" in broken.scripts[1], false);
});

test("scripts を受けると、その場の JS は inline- の id・版 1 で写り、詳しい所には名前・口・バイト数だけが出る", () => {
  const rows = [];
  const inline = { name: "close-banner", phase: "preload", source: "x;" };
  const answer = submitCrawl(
    rows,
    { seeds: ["https://site.test/"], scripts: [{ inline }, { catalog: "autofetch" }] },
    NOW,
    RUNS,
    versions,
  );
  assert.equal(answer.status, 202);
  const detail = crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts);
  assert.deepEqual(
    detail.scripts.map((s) => [s.id, s.version, s.phase]),
    [
      ["inline-close-banner", 1, "preload"],
      ["autofetch", 1, "behavior"],
    ],
  );
  // source は運ばない（capture-ledger v0.59.0）。走行中の行は 2 秒ごとに引き直すので
  assert.deepEqual(detail.scripts[0].inline, { name: "close-banner", phase: "preload", bytes: 2 });
  assert.equal(JSON.stringify(detail).includes('"source"'), false);
  assert.equal("inline" in detail.scripts[1], false);
  // 一覧の行には出さない（欄は台帳の一覧と揃えて固定している）
  assert.equal("scripts" in submittedRow(rows[0], NOW), false);
});

test("名前の口は、受けた行と台本の行の両方で、その場の JS を source ごと返す", () => {
  const rows = [];
  const inline = { name: "close-banner", phase: "preload", source: "x;" };
  submitCrawl(
    rows,
    { seeds: ["https://site.test/"], scripts: [{ inline }] },
    NOW,
    RUNS,
    versions,
  );
  const mine = inlineSource(rows[0].scripts, "close-banner");
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body, { ...inline, sha256: rows[0].scripts[0].sha256 });

  // 台本の行（compile の段で落ちた行）からも引ける。sha256 は詳しい所と同じ
  const failed = scenario.crawls.find(
    (c) => c.state === "failed" && c.scripts?.some((x) => x.inline !== undefined),
  );
  const theirs = inlineSource(failed.scripts, "close-banner");
  assert.equal(theirs.status, 200);
  assert.equal(theirs.body.sha256, crawlDetail(failed).scripts[0].sha256);
  assert.match(theirs.body.source, /close/);
});

test("名前の口は、台帳のスクリプト・知らない名前・知らない行には 404（台帳と同じ文）", () => {
  const rows = [];
  submitCrawl(
    rows,
    {
      seeds: ["https://site.test/"],
      scripts: [{ inline: { name: "a", phase: "behavior", source: "x;" } }, { catalog: "autofetch" }],
    },
    NOW,
    RUNS,
    versions,
  );
  for (const name of ["autofetch", "nope"]) {
    assert.deepEqual(inlineSource(rows[0].scripts, name), {
      status: 404,
      body: { error: "not found" },
    });
  }
  assert.equal(inlineSource(undefined, "a").status, 404);
});

test("走行中でも、走らせるものの誤りは 409 より先に 400 —— 台帳と同じ順", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions);
  const busy = submitCrawl(
    rows,
    { seeds: ["https://site.test/"], scripts: [{ catalog: "typo-scroll" }] },
    NOW + 1000,
    RUNS,
    versions,
  );
  assert.equal(busy.status, 400);
  // 形が合っていれば、走行中は 409（今までどおり）
  const ok = submitCrawl(rows, { seeds: ["https://site.test/"], scripts: [] }, NOW + 1000, RUNS, versions);
  assert.equal(ok.status, 409);
});

test("scripts を省くと、起点で選んだ既定を走らせたものとして返す —— 合うサイト用のスクリプトは札ごと", () => {
  const ranFrom = (seed) => {
    const rows = [];
    submitCrawl(rows, { seeds: [seed] }, NOW, RUNS, versions);
    return crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts).scripts;
  };
  assert.deepEqual(at(ranFrom("https://other-site.test/")), ["autoscroll@2"]);
  const onSite = ranFrom("https://laws.e-gov.go.jp/");
  assert.deepEqual(at(onSite), ["autoscroll@2", "egov-law-search@1"]);
  // 札は台帳 v0.61.0 と同じく詳しい所に出る。札の無い物は空の並び
  assert.deepEqual(
    onSite.map((s) => s.sites),
    [[], ["laws.e-gov.go.jp"]],
  );
});

/** 版を `id@版:enabled` で並べる（一覧の口の 1 行が既定に入るかまで比べる）。 */
const atOn = (list) => list.map((v) => `${v.id}@${String(v.version)}:${String(v.enabled)}`);

test("一覧の口は各 id に 1 行 —— 有効な版の中の最新、無ければ最新版を enabled: false で。サイト用も札つきで", () => {
  assert.deepEqual(atOn(pickable(versions)), ["autofetch@1:false", "autoscroll@2:true", "egov-law-search@1:true"]);
  assert.deepEqual(pickable(versions)[2].sites, ["laws.e-gov.go.jp"]);
  // 新しい版だけを無効にすると、有効な古い版が出る（版ごとの巻き戻し）
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  assert.deepEqual(atOn(pickable(off)), ["autofetch@1:false", "autoscroll@1:true", "egov-law-search@1:true"]);
  // 全部の版を無効にすると、消えずに最新版が enabled: false で出る
  const allOff = versions.map((v) => (v.id === "autoscroll" ? { ...v, enabled: false } : v));
  assert.deepEqual(atOn(pickable(allOff)), ["autofetch@1:false", "autoscroll@2:false", "egov-law-search@1:true"]);
});

test("既定の元（有効な各 id の最新版）は、既定に入らない id を飛ばす", () => {
  assert.deepEqual(at(latestEnabled(versions)), ["autoscroll@2", "egov-law-search@1"]);
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  assert.deepEqual(at(latestEnabled(off)), ["autoscroll@1", "egov-law-search@1"]);
});

test("既定の顔ぶれは、有効な物のうち札の無い物と、起点に合うサイト用の物 —— autofetch は入らず、ポートは見ない", () => {
  assert.deepEqual(at(defaultSet(versions, new Set())), ["autoscroll@2"]);
  assert.deepEqual(at(defaultSet(versions, seedHosts("https://laws.e-gov.go.jp:8443/a"))), [
    "autoscroll@2",
    "egov-law-search@1",
  ]);
  // 完全一致。同じ e-Gov でも別のホスト（www.e-gov.go.jp）は合わない
  assert.deepEqual(at(defaultSet(versions, seedHosts("https://www.e-gov.go.jp/"))), ["autoscroll@2"]);
});

test("既定は最新版を選んでから札で絞る —— 札を付け直した id の、札の無い古い版は出てこない", () => {
  // 台帳 v0.61.0 の resolveScripts と同じ順。逆にすると v1 が出てくる
  const resited = [
    ...versions,
    { ...versions[0], id: "google-results", version: 1, sites: [] },
    { ...versions[0], id: "google-results", version: 2, sites: ["www.google.com"] },
  ];
  assert.deepEqual(at(defaultSet(resited, seedHosts("https://other-site.test/"))), ["autoscroll@2"]);
});

test("代役の既定と、新しいクロールの画面の既定（public/start.js）は、同じ起点に同じ顔ぶれを出す", () => {
  // 決まりの正は台帳。2 つの写しが食い違えば、dashboard が「省いても同じ」と送った頼みで別の物が走る。
  // dashboard が持つのは一覧の口の答え（pickable）だけ —— 版ごとに無効にした台帳でも、それで同じ顔ぶれになる
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  const allOff = versions.map((v) => (v.id === "autoscroll" ? { ...v, enabled: false } : v));
  const seeds = [
    "",
    "https://other-site.test/",
    "https://laws.e-gov.go.jp/",
    "http://laws.e-gov.go.jp:8080/a\nhttps://other-site.test/",
    "https://www.e-gov.go.jp/",
    "not a url\nHTTPS://LAWS.E-GOV.GO.JP/",
  ];
  for (const list of [versions, off, allOff]) {
    for (const text of seeds) {
      const hosts = seedHosts(text);
      assert.deepEqual(
        defaultSet(list, hosts).map((v) => v.id),
        defaultIds(pickable(list), hosts),
        JSON.stringify(text),
      );
    }
  }
});

test("既定に入らないスクリプトも、名指せば最新版が走る（台帳 v0.64.0）", () => {
  const rows = [];
  const answer = submitCrawl(rows, { seeds: ["https://other-site.test/"], scripts: [{ catalog: "autofetch" }] }, NOW, RUNS, versions);
  assert.equal(answer.status, 202);
  assert.deepEqual(at(crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts).scripts), ["autofetch@1"]);
});

test("起点に合わないサイト用のスクリプトを名指すと、台帳と同じ文で 400 —— 走行中でも 409 より先", () => {
  const rows = [];
  const post = (seeds) =>
    submitCrawl(rows, { seeds, scripts: [{ catalog: "autofetch" }, { catalog: "egov-law-search" }] }, NOW, RUNS, versions);
  assert.deepEqual(post(["https://other-site.test/"]), {
    status: 400,
    body: {
      error: "site scripts need a seed on their site",
      ids: ["egov-law-search"],
      hint: "egov-law-search: laws.e-gov.go.jp",
    },
  });
  // 起点のどれかが合えば通る（ポートは見ない）
  assert.equal(post(["https://other-site.test/", "https://laws.e-gov.go.jp:8443/"]).status, 202);
  assert.equal(post(["https://other-site.test/"]).status, 400);
});

test("既定が空なら 400 —— 台帳にスクリプトが無いのと、全部が別のサイト用とで文を分ける（台帳と同じ文）", () => {
  const post = (list, body = {}) => submitCrawl([], { seeds: ["https://other-site.test/"], ...body }, NOW, RUNS, list);
  assert.deepEqual(post([]), {
    status: 400,
    body: {
      error: "no scripts are registered",
      hint: "pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])",
    },
  });
  const onlySite = versions.filter((v) => v.id === "egov-law-search");
  assert.deepEqual(post(onlySite), {
    status: 400,
    body: {
      error: "no default scripts for these seeds",
      hint: "egov-law-search: laws.e-gov.go.jp (run nothing on purpose: send scripts: [])",
    },
  });
  // 「何も走らせない」は書ける
  assert.equal(post(onlySite, { scripts: [] }).status, 202);
});

test("版の一覧は新しい順で、どの版にも source が無い。知らない id は 404", () => {
  const answer = versionsOf(versions, "autoscroll");
  assert.equal(answer.status, 200);
  assert.deepEqual(
    answer.body.versions.map((v) => v.version),
    [2, 1],
  );
  for (const v of answer.body.versions) {
    assert.deepEqual(Object.keys(v).sort(), ["bytes", "createdAt", "enabled", "params", "phase", "sha256", "sites", "version"]);
  }
  assert.deepEqual(versionsOf(versions, "nope"), { status: 404, body: { error: "not found" } });
});

test("1 版は source を持ち、sha256 と bytes は source から数える（写しは capture-scripts v0.7.0）", () => {
  const fetch1 = versionOf(versions, "autofetch", "1");
  assert.equal(fetch1.status, 200);
  assert.equal(fetch1.body.sha256.slice(0, 12), "3f1de4b0630b");
  assert.equal(fetch1.body.bytes, 4345);
  const scroll1 = versionOf(versions, "autoscroll", "1").body;
  assert.equal(scroll1.sha256.slice(0, 12), "4117c0345645");
  assert.equal(scroll1.bytes, 2706);
  assert.match(scroll1.source.split("\n")[32], /remainingMs < stepDelayMs \+ settleMs/);
  // v0.7.0 から report は id を取らない（写しが古いままなら、ここで分かる）
  assert.match(scroll1.source.split("\n")[47], /globalThis\.__bh\.report\(\{$/);
  // egov-law-search は v0.6.0 で変数 query を読む形になり、v0.7.0 で途中の様子を log に書く形になった
  const egov1 = versionOf(versions, "egov-law-search", "1").body;
  assert.equal(egov1.sha256.slice(0, 12), "87ae2cec6079");
  assert.equal(egov1.bytes, 3438);
  assert.match(egov1.source.split("\n")[18], /__bh\.vars\.query \?\? opts\.query/);
  assert.match(egov1.source.split("\n")[40], /__bh\.log\.warn\("検索窓が無い"/);
  assert.deepEqual(versionOf(versions, "autoscroll", "2").body.options, { maxSteps: 60 });
  assert.deepEqual(versionOf(versions, "autoscroll", "9"), { status: 404, body: { error: "not found" } });
  assert.equal(versionOf(versions, "autoscroll", "abc").body.message, "params/version must be integer");
  assert.equal(versionOf(versions, "autoscroll", "0").body.message, "params/version must be >= 1");
});

test("受け皿の型は台本の file の中身。台本に無ければ 404（型を取り込んでいない台帳）", () => {
  const types = hostTypesOf(scenario);
  assert.equal(types.status, 200);
  assert.equal(types.body.version, 1);
  assert.equal(types.body.bytes, Buffer.byteLength(types.body.source, "utf8"));
  // 写しは capture-scripts v0.7.0（受け皿に log が在り、report は data だけを取る。vars と secrets は v0.6.0 から）
  assert.equal(types.body.sha256.slice(0, 12), "de649718ebb8");
  assert.equal(types.body.bytes, 3125);
  assert.match(types.body.source, /warn\(message: string, data\?: object\): void;/);
  assert.match(types.body.source, /report\(data: object\): void;/);
  assert.match(types.body.source, /vars: Readonly<Record<string, string \| undefined>>/);
  const { hostTypes: _hostTypes, ...without } = scenario;
  assert.deepEqual(hostTypesOf(without), { status: 404, body: { error: "not found" } });
});

test("台本のクロールが走らせた台帳のスクリプトは、台帳のその版と同じ sha256（5b0c0008 の autoscroll だけはわざと違う）", () => {
  const MISMATCH = "5b0c0008-6a1e-4000-8000-000000000008 autoscroll@1";
  const seen = [];
  for (const c of scenario.crawls) {
    for (const s of (c.scripts ?? []).filter((x) => x.inline === undefined)) {
      const key = `${c.crawlId} ${s.id}@${String(s.version)}`;
      const same = versions.find((v) => v.id === s.id && v.version === s.version)?.sha256 === s.sha256;
      seen.push(key);
      assert.equal(same, key !== MISMATCH, key);
    }
  }
  assert.ok(seen.includes(MISMATCH));
});

test("下敷きを実物の写しに掛けると、替わるのは autoscroll の 9・18 行と autofetch の 14・17 行（report は id を取らない）", () => {
  const sourceOf = (id) => versionOf(versions, id, "1").body.source;
  assert.deepEqual(asTemplate(sourceOf("autoscroll"), "autoscroll", "my-autoscroll").changed, [9, 18]);
  assert.deepEqual(asTemplate(sourceOf("autofetch"), "autofetch", "my-autofetch").changed, [14, 17]);
});

test("知らないスクリプトの id・重ね・形の誤り・scriptIds は、台帳と同じ文で 400", () => {
  const post = (body) =>
    submitCrawl([], { seeds: ["https://site.test/"], ...body }, NOW, RUNS, versions);
  const inline = (name) => ({ inline: { name, phase: "behavior", source: "x;" } });
  assert.deepEqual(post({ scripts: [{ catalog: "typo-scroll" }] }), {
    status: 400,
    body: { error: "unknown script ids", ids: ["typo-scroll"] },
  });
  assert.deepEqual(post({ scripts: [inline("a"), inline("a")] }).body, {
    error: "duplicate script ids",
    ids: ["inline-a"],
  });
  // 文は台帳 v0.58.0 が Fastify の schema で返す物（dashboard は message を出す）
  assert.equal(
    post({ scripts: [inline("Probe")] }).body.message,
    'body/scripts/0/inline/name must match pattern "^[a-z][a-z0-9-]*$"',
  );
  assert.equal(
    post({ scripts: [{ catalog: "autofetch", ...inline("a") }] }).body.message,
    "body/scripts/0 must NOT have more than 1 properties",
  );
  assert.equal(post({ scripts: [{}] }).body.message, "body/scripts/0 must NOT have fewer than 1 properties");
  assert.equal(post({ scriptIds: ["autofetch"] }).body.message, "body must NOT have additional properties");
});

// ── クロールごとの値（capture-ledger v0.67.0 の src/api/crawls.ts の形）──────────────

/** 台本の Windmill の代わり（windmillSecrets・windmillVariables）。edited_at は台本の撮った時刻。 */
const WINDMILL = { secrets: scenario.windmillSecrets, variables: scenario.windmillVariables, editedAt: scenario.capturedAt };
const probe = (params) => ({
  inline: { name: "probe", phase: "behavior", source: "x;", ...(params === undefined ? {} : { params }) },
});

test("一覧の口と 1 版の口は宣言（params）を運ぶ —— egov-law-search は変数 query を宣言し、ほかは空", () => {
  const list = scriptRows(versions);
  assert.deepEqual(list.find((v) => v.id === "egov-law-search").params, [
    { name: "query", kind: "variable", required: false, summary: "法令名の検索語。省けばソースの既定" },
  ]);
  assert.deepEqual(list.find((v) => v.id === "autoscroll").params, []);
  // 一覧の行の欄は、身元と札と enabled と宣言だけ（source・options・bytes は 1 版の口）
  for (const row of list) {
    assert.deepEqual(Object.keys(row).sort(), ["enabled", "id", "params", "phase", "sha256", "sites", "version"]);
  }
  assert.deepEqual(
    versionOf(versions, "egov-law-search", "1").body.params.map((p) => p.name),
    ["query"],
  );
});

test("知らない鍵は schema の 400 で、台帳の鍵（maxDepth・variables）は通る。variables の形の誤りも schema の 400", () => {
  const post = (body) => submitCrawl([], { seeds: ["https://laws.e-gov.go.jp/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.equal(post({ foo: 1 }).body.message, "body must NOT have additional properties");
  assert.equal(post({ maxDepth: 2 }).status, 202);
  assert.equal(post({ variables: { query: "個人情報" } }).status, 202);
  assert.equal(post({ variables: [] }).body.message, "body/variables must be object");
  assert.equal(post({ variables: { Query: "x" } }).body.message, "body/variables property name must be valid");
  assert.equal(post({ variables: { query: 1 } }).body.message, "body/variables/query must be string");
  assert.equal(
    post({ variables: { query: "x".repeat(4097) } }).body.message,
    "body/variables/query must NOT have more than 4096 characters",
  );
});

test("変数は宣言に照らして台帳と同じ文で 400 —— 必須が無い・知らない名前。宣言の無いその場の JS が在れば知らない名前を許す", () => {
  const rows = [];
  const post = (body) => submitCrawl(rows, { seeds: ["https://laws.e-gov.go.jp/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.deepEqual(post({ variables: { qeury: "x" } }), {
    status: 400,
    body: { error: "unknown variables", names: ["qeury"] },
  });
  assert.deepEqual(post({ scripts: [probe([{ name: "q", kind: "variable", required: true, summary: "語" }])] }), {
    status: 400,
    body: { error: "missing variables", names: ["q"] },
  });
  // 宣言を添えないその場の JS が 1 本でも在れば、知らない名前は通る（その JS が読むかもしれない）
  assert.equal(post({ scripts: [probe()], variables: { anything: "x" } }).status, 202);
  assert.equal(rows.length, 1, "断った本は行にしない");
  // 同じ名前を別の種類で宣言している・シークレットの名前を変数で渡している（台帳の checkValues と同じ文）
  const later = NOW + RUNS * 1000;
  const twoKinds = [probe([{ name: "q", kind: "variable" }]), { inline: { name: "other", phase: "behavior", source: "y;", params: [{ name: "q", kind: "secret" }] } }];
  assert.deepEqual(submitCrawl(rows, { seeds: ["https://site.test/"], scripts: twoKinds }, later, RUNS, versions, WINDMILL), {
    status: 400,
    body: { error: "conflicting params", names: ["q"] },
  });
  assert.deepEqual(
    submitCrawl(rows, { seeds: ["https://site.test/"], scripts: [probe([{ name: "api_token", kind: "secret" }])], variables: { api_token: "x" } }, later, RUNS, versions, WINDMILL),
    { status: 400, body: { error: "secrets cannot be passed as variables", names: ["api_token"] } },
  );
  // 宣言の形の誤りは schema の 400。同じ名前が 2 度あるのは台帳の readParams の 400（summary は省ける）
  assert.equal(
    post({ scripts: [probe([{ name: "Q", kind: "variable", summary: "語" }])] }).body.message,
    'body/scripts/0/inline/params/0/name must match pattern "^[a-z][a-z0-9_]*$"',
  );
  assert.equal(
    post({ scripts: [probe([{ name: "q", kind: "token", summary: "語" }])] }).body.message,
    "body/scripts/0/inline/params/0/kind must be equal to one of the allowed values",
  );
  assert.equal(
    post({ scripts: [probe([{ name: "q", kind: "variable", default: "x" }])] }).body.message,
    "body/scripts/0/inline/params/0 must NOT have additional properties",
  );
  assert.deepEqual(post({ scripts: [probe([{ name: "q", kind: "variable" }, { name: "q", kind: "variable" }])] }), {
    status: 400,
    body: { error: "invalid params", script: "inline-probe", hint: "params に q が 2 度ある" },
  });
});

test("宣言したシークレットは Windmill の代わりに照らす —— 無い必須の物は path つきで 400、secret でなければ 400、在れば行に名前と path", () => {
  const rows = [];
  const secret = (name, required = true) => ({ name, kind: "secret", required, summary: "鍵" });
  const post = (params, now = NOW) =>
    submitCrawl(rows, { seeds: ["https://site.test/"], scripts: [probe(params)] }, now, RUNS, versions, WINDMILL);
  assert.deepEqual(post([secret("nope")]), {
    status: 400,
    body: {
      error: "unknown secrets",
      secrets: [{ name: "nope", path: "f/waggle_secrets/nope", declaredBy: ["inline-probe"] }],
      hint: "wmill variable add <value> f/waggle_secrets/nope --secret",
    },
  });
  assert.deepEqual(post([secret("plain_token")]), {
    status: 400,
    body: {
      error: "not a secret variable",
      secrets: [{ name: "plain_token", path: "f/waggle_secrets/plain_token", declaredBy: ["inline-probe"] }],
    },
  });
  // required でない物が Windmill に無ければ、渡さないだけ（スクリプトは undefined を読む）
  assert.equal(post([secret("nope", false)]).status, 202);
  assert.deepEqual(rows[0].secrets, []);
  const done = NOW + RUNS * 1000;
  assert.equal(post([secret("api_token")], done).status, 202);
  const detail = crawlDetail(submittedRow(rows[0], done), rows[0].scripts, rows[0].rules, {
    variables: rows[0].variables,
    secrets: rows[0].secrets,
  });
  assert.deepEqual(detail.secrets, [
    { name: "api_token", path: "f/waggle_secrets/api_token", editedAt: scenario.capturedAt, rotated: null },
  ]);
  assert.deepEqual(detail.variables, {});
});

test("値の 400 は、走行中でも 409 より先（台帳と同じ順）", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions, WINDMILL);
  const busy = submitCrawl(rows, { seeds: ["https://site.test/"], variables: { qeury: "x" } }, NOW + 1000, RUNS, versions, WINDMILL);
  assert.equal(busy.status, 400);
  assert.equal(submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW + 1000, RUNS, versions, WINDMILL).status, 409);
});

test("行の詳しい所は variables と secrets を必ず持つ —— 台本の 5b0c0007 は変数 query とシークレット api_token、ほかの行は空", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0007"));
  const detail = crawlDetail(c);
  assert.deepEqual(detail.variables, { query: "個人情報" });
  assert.deepEqual(
    detail.secrets.map((s) => [s.name, s.path, s.rotated]),
    [["api_token", "f/waggle_secrets/api_token", null]],
  );
  assert.ok(Date.parse(detail.secrets[0].editedAt) > 0);
  // 宣言はその場の JS の params に在り、台本の Windmill に api_token が置いてある（同じ頼みを送れば通る形）
  assert.ok(c.scripts[0].inline.params.some((p) => p.name === "api_token" && p.kind === "secret"));
  assert.ok(scenario.windmillSecrets.includes("api_token"));
  const other = crawlDetail(scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0002")));
  assert.deepEqual([other.variables, other.secrets], [{}, []]);
  // 受けた行も同じ欄を持ち、値は一覧の行には出ない
  const rows = [];
  submitCrawl(rows, { seeds: ["https://laws.e-gov.go.jp/"], variables: { query: "個人情報" } }, NOW, RUNS, versions, WINDMILL);
  const mine = crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts, rows[0].rules, {
    variables: rows[0].variables,
    secrets: rows[0].secrets,
  });
  assert.deepEqual(mine.variables, { query: "個人情報" });
  assert.deepEqual(mine.secrets, []);
  assert.equal("variables" in submittedRow(rows[0], NOW), false);
});

test("アーカイブの 1 行は、台帳の /api/archives と同じ欄を持ち、台本で上書きできる", () => {
  const rows = archiveRows(["good.wacz", "datapackage-bad-hash.wacz"], scenario);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), LEDGER_ARCHIVE_KEYS, row.objectKey);
  const bad = rows.find((row) => row.objectKey === "sandbox/datapackage-bad-hash.wacz");
  assert.equal(bad.waczComplete, false);
});

test("見えない行は一覧に出るが、署名は出ない", () => {
  const names = ["good.wacz"];
  const ghost = archiveRows(names, { ...scenario, hidden: ["ghost.wacz"] }).find(
    (row) => row.objectKey === "sandbox/ghost.wacz",
  );
  assert.ok(ghost);
  assert.equal(signedUrlOf(ghost.id, names), undefined);
  assert.equal(signedUrlOf("not-an-id", names), undefined);
});

/** capture-ledger の src/api/search.ts が当たり 1 件に返す欄（CAPTURE-53 の後。highlight は本文に当たったときだけ）。 */
const LEDGER_HIT_KEYS = [
  "archiveId",
  "capturedAt",
  "highlight",
  "labels",
  "objectKey",
  "sourceUrl",
  "stage",
  "text",
  "textTruncated",
  "textWithheld",
  "title",
  "url",
];
const SEARCH_NAMES = ["datapackage-bad-hash.wacz", "good.wacz"];
const ask = (params, s = scenario, names = SEARCH_NAMES) => searchOf(names, s, new URLSearchParams(params));

test("検索の口は、写しの行が在るアーカイブでは写しの行だけ、無いアーカイブは文書の行を返し、見えないアーカイブは出さない", () => {
  const answer = ask({ q: "ランプ" });
  assert.equal(answer.status, 200);
  assert.deepEqual(
    answer.body.hits.map((hit) => [hit.objectKey, hit.stage]),
    [
      ["sandbox/datapackage-bad-hash.wacz", null],
      ["sandbox/good.wacz", "after-behaviors"],
    ],
  );
  // total は返した当たりの数（台帳も見せてよい物だけを数える）
  assert.equal(answer.body.total, 2);
  // good.wacz の文書の行も同じ語を含むが、写しの行が在るので引かない。ghost.wacz は見えない
  assert.equal(answer.body.hits.some((hit) => hit.objectKey === "sandbox/ghost.wacz"), false);
});

test("検索の当たり 1 件は、台帳と同じ欄を持ち、写しの URL は urn、文書の URL は取り込んだ URL", () => {
  const { hits } = ask({ q: "ランプ" }).body;
  for (const hit of hits) assert.deepEqual(Object.keys(hit).sort(), LEDGER_HIT_KEYS, hit.objectKey);
  const [doc, snapshot] = hits;
  assert.equal(doc.url, doc.sourceUrl);
  assert.match(snapshot.url, /^urn:browserhive:snapshot:after-behaviors:/);
  assert.match(snapshot.highlight[0], /<em>ランプ<\/em>/);
});

test("検索は題か本文に、大小を問わず語を含む行に当たり、題だけの当たりには highlight が無い", () => {
  const s = { ...scenario, hidden: [], searchPages: { "x.wacz": [{ title: "Desk Lamp", text: "a light" }] } };
  const { hits } = ask({ q: "LAMP" }, s, ["x.wacz"]).body;
  assert.equal(hits.length, 1);
  assert.equal("highlight" in hits[0], false);
  assert.equal(ask({ q: "nothing-here" }, s, ["x.wacz"]).body.total, 0);
});

test("検索の口は、q の無い・空の・ほかの欄のある問いを 400 で断る（台帳の schema と同じ）", () => {
  assert.equal(ask({}).status, 400);
  assert.equal(ask({ q: "" }).status, 400);
  assert.equal(ask({ q: "ランプ", size: "10" }).status, 400);
  assert.match(ask({ q: "" }).body.message, /must NOT have fewer than 1 characters/);
});

test("署名の代わりに、置き場の file:// の URL を返す", () => {
  assert.deepEqual(signedUrlOf(idOf("good.wacz"), ["good.wacz"]), {
    url: "file:///samples/good.wacz",
    expiresIn: 300,
  });
});

test("id は名前から決まり、UUID の形をしている", () => {
  assert.equal(idOf("good.wacz"), idOf("good.wacz"));
  assert.notEqual(idOf("good.wacz"), idOf("ghost.wacz"));
  assert.match(idOf("good.wacz"), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// ── 規則の並び（capture-ledger v0.62.0 の src/crawl/rules.ts と src/api/crawls.ts から写した）──

test("規則を省けば、台帳の既定（same-origin を辿る 1 本）で固定する", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions);
  assert.deepEqual(rows[0].rules, [{ follow: "same-origin" }]);
  assert.deepEqual(crawlDetail(submittedRow(rows[0], NOW), [], rows[0].rules).rules, [{ follow: "same-origin" }]);
});

test("規則は読んだ形で固定する —— 前方一致は正規化した URL", () => {
  const rows = [];
  const answer = submitCrawl(
    rows,
    {
      seeds: ["https://www.site.test/"],
      rules: [{ skip: "HTTPS://WWW.Site.test:443/search" }, { skip: "ads.site.test" }, { follow: "same-site" }, { capture: "any" }],
    },
    NOW,
    RUNS,
    versions,
  );
  assert.equal(answer.status, 202);
  assert.deepEqual(rows[0].rules, [
    { skip: "https://www.site.test/search" },
    { skip: "ads.site.test" },
    { follow: "same-site" },
    { capture: "any" },
  ]);
});

test("規則の 400 は台帳と同じ 3 つの文で、名指す物も同じ形。scope は知らない鍵", () => {
  const rows = [];
  const say = (body) => submitCrawl(rows, { seeds: ["https://www.site.test/"], ...body }, NOW, RUNS, versions);
  assert.deepEqual(say({ rules: [{ follow: "same-host" }, { skip: "ADS.site.test" }] }), {
    status: 400,
    body: { error: "invalid rule patterns", rules: [{ rule: 2, pattern: "ADS.site.test" }] },
  });
  assert.deepEqual(say({ rules: [{ follow: "same-site" }, { skip: "ads.site.test" }] }), {
    status: 400,
    body: { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }] },
  });
  assert.deepEqual(
    say({ seeds: ["https://www.site.test/", "https://ads.site.test/"], rules: [{ skip: "ads.site.test" }, { follow: "same-site" }] }),
    { status: 400, body: { error: "seeds the rules do not follow", seeds: ["https://ads.site.test/"] } },
  );
  assert.equal(say({ scope: "same-host" }).body.message, "body must NOT have additional properties");
  assert.equal(say({ rules: [] }).body.message, "body/rules must NOT have fewer than 1 items");
  assert.equal(say({ rules: [{ follow: "a", skip: "b" }] }).body.message, "body/rules/0 must NOT have more than 1 properties");
  assert.equal(say({ rules: [{ crawl: "any" }] }).body.message, "body/rules/0 must NOT have additional properties");
  assert.equal(rows.length, 0, "断った本は行にしない");
});

test("代役の same-site は、ホスト名の最後の 2 ラベルで近似する（Public Suffix List を持たない）", () => {
  const rows = [];
  // 台帳なら example.co.jp と other.co.jp は別のサイト。代役は co.jp で同じと読む —— docs の development に書いてある
  const answer = submitCrawl(
    rows,
    { seeds: ["https://www.example.co.jp/"], rules: [{ follow: "same-site" }, { skip: "other.co.jp" }] },
    NOW,
    RUNS,
    versions,
  );
  assert.deepEqual(answer.body, { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }] });
});

test("確かめの口は、行ごとの読めた種類と覆い、起点ごとのサイトと辿るかを、台帳と同じ形で返す", () => {
  const answer = crawlRulesCheck(
    ["https://www.site.test/", "not a url"],
    ["follow:same-site", "skip:ads.site.test", "skip:HTTPS://WWW.Site.test:443/a", "capture:*.x"],
  );
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, {
    seeds: [
      { url: "https://www.site.test/", valid: true, site: "site.test", followed: true },
      { url: "not a url", valid: false },
    ],
    rules: [
      { rule: 1, action: "follow", kind: "scope", pattern: "same-site" },
      { rule: 2, action: "skip", kind: "domain", pattern: "ads.site.test", coveredBy: 1 },
      { rule: 3, action: "skip", kind: "prefix", pattern: "https://www.site.test/a", coveredBy: 1 },
      { rule: 4, action: "capture", kind: "invalid", pattern: "*.x" },
    ],
    ok: false,
  });
  assert.equal(crawlRulesCheck([], ["crawl:any"]).status, 400);
});

test("判断の口は、台本の行の規則・判断・robots を返す（受けた行は空）", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0007"));
  const answer = decisionsOf(c);
  assert.deepEqual(Object.keys(answer), ["crawlId", "rules", "decisions", "robots"]);
  assert.ok(answer.decisions.length > 0 && answer.robots.length > 0, "画面の絵に出す行がある");
  // 台本の規則は台帳が断らない並びであること（覆われた行を絵に載せない）
  const seeds = c.seeds.map((seed) => new URL(seed).href);
  assert.equal(submitCrawl([], { seeds, rules: c.rules, scripts: [] }, NOW, RUNS, versions).status, 202);
  assert.deepEqual(decisionsOf({ crawlId: "x" }), { crawlId: "x", rules: [{ follow: "same-origin" }], decisions: [], robots: [] });
});

// ── ページの口（CAPTURE-18 で台帳が足す GET /api/crawls/:id/pages と …/pages/:page/log の形）────────

/** ページの 1 行の欄（一覧の pages[i] と、ログの答えの page）。 */
const LEDGER_PAGE_KEYS = [
  "id",
  "url",
  "depth",
  "state",
  "reason",
  "taskId",
  "archiveId",
  "capturedAt",
  "bundledRev",
  "logCounts",
].sort();
/** ページの行の logCounts の欄（BrowserHive の答えの log.counts と dropped）。 */
const LOG_COUNTS_KEYS = ["debug", "info", "warn", "error", "dropped"].sort();
/** ログの 1 行で、必ず在る欄と、在ってよい欄（BrowserHive の答えの log.lines[i] をそのまま）。 */
const LINE_REQUIRED = ["at", "ms", "source", "level", "msg"];
const LINE_KEYS = new Set([...LINE_REQUIRED, "dpr", "script", "data", "truncated"]);
const crawlOf = (head) => scenario.crawls.find((c) => c.crawlId.startsWith(head));
const query = (text = "") => new URLSearchParams(text);

test("ページの一覧は { pages, next } で、1 行の欄と logCounts の欄は台帳と同じ。id は数字だけの文字列", () => {
  for (const c of scenario.crawls.filter((x) => x.pages !== undefined)) {
    const answer = pageList(c, query());
    assert.equal(answer.status, 200);
    assert.deepEqual(Object.keys(answer.body), ["pages", "next"]);
    for (const row of answer.body.pages) {
      assert.deepEqual(Object.keys(row).sort(), LEDGER_PAGE_KEYS, `${c.crawlId} ${row.id}`);
      assert.match(row.id, /^[0-9]+$/);
      if (row.logCounts !== null) assert.deepEqual(Object.keys(row.logCounts).sort(), LOG_COUNTS_KEYS);
    }
  }
  // pages の無い行は空（代役の省略）
  assert.deepEqual(pageList(crawlOf("5b0c0001"), query()).body, { pages: [], next: null });
});

test("一覧は id の昇順で、after の後から limit 件（既定 100）。続きが在れば next は返した最後の id", () => {
  const c = crawlOf("5b0c0009");
  const ids = (text) => pageList(c, query(text)).body.pages.map((p) => p.id);
  assert.deepEqual(ids(""), ["1201", "1202", "1203", "1204"]);
  assert.equal(pageList(c, query()).body.next, null);
  assert.deepEqual(pageList(c, query("limit=2")).body, {
    pages: c.pages.slice(0, 2).map(pageRow),
    next: "1202",
  });
  assert.deepEqual(ids("after=1202&limit=2"), ["1203", "1204"]);
  assert.equal(pageList(c, query("after=1202&limit=2")).body.next, null);
  // id は数として比べる（bigserial を文字列で持つ）
  const wide = { crawlId: "x", pages: [{ id: "10", url: "https://a.test/", state: "pending" }, { id: "9", url: "https://b.test/", state: "pending" }] };
  assert.deepEqual(pageList(wide, query("after=8")).body.pages.map((p) => p.id), ["9", "10"]);
});

test("limit は 1〜500 の整数、after は数字だけ。違えば行を探す前に 400、行が無ければ 404", () => {
  const c = crawlOf("5b0c0009");
  for (const text of ["limit=0", "limit=501", "limit=1.5", "limit=x", "after=12a", "after=-1"]) {
    const answer = pageList(c, query(text));
    assert.equal(answer.status, 400, text);
    assert.match(answer.body.message, new RegExp(`querystring/${text.split("=")[0]}`), text);
    assert.equal(pageList(undefined, query(text)).status, 400, `${text}（行が無くても先に 400）`);
  }
  assert.equal(pageList(c, query("limit=500")).status, 200);
  assert.equal(pageList(c, query("limit=1")).status, 200);
  assert.deepEqual(pageList(undefined, query()), { status: 404, body: { error: "not found" } });
});

test("1 ページのログは { page, log, reason }。行は届いた順のまま、必ず在る欄と在ってよい欄だけ", () => {
  const c = crawlOf("5b0c0009");
  const answer = pageLog(c, "1202");
  assert.equal(answer.status, 200);
  assert.deepEqual(Object.keys(answer.body), ["page", "log", "reason"]);
  assert.deepEqual(answer.body.page, pageRow(c.pages[1]));
  assert.equal(answer.body.reason, null);
  assert.deepEqual(Object.keys(answer.body.log), ["lines", "counts", "dropped"]);
  assert.deepEqual(Object.keys(answer.body.log.counts).sort(), ["debug", "error", "info", "warn"]);
  for (const p of c.pages.filter((x) => x.log !== undefined)) {
    const lines = pageLog(c, p.id).body.log.lines;
    for (const line of lines) {
      for (const key of LINE_REQUIRED) assert.ok(key in line, `${p.id} ${key}`);
      for (const key of Object.keys(line)) assert.ok(LINE_KEYS.has(key), `${p.id} ${key}`);
      assert.equal(line.source === "script", typeof line.script === "string", `${p.id} script は script の行にだけ`);
    }
    const ms = lines.map((line) => line.ms);
    assert.deepEqual(ms, [...ms].sort((a, b) => a - b), `${p.id} ms が減らない`);
  }
});

test("読めないページは log: null と理由 —— taskId の無いページは not-captured、ログの無い取り込みは no-log", () => {
  assert.deepEqual(pageLog(crawlOf("5b0c0009"), "1204").body, {
    page: pageRow(crawlOf("5b0c0009").pages[3]),
    log: null,
    reason: "not-captured",
  });
  assert.equal(pageLog(crawlOf("5b0c0006"), "601").body.reason, "no-log");
  assert.equal(pageLog(crawlOf("5b0c0006"), "602").body.reason, "not-captured");
  // 台本で理由を名指せる（保管庫に無い・契約に合わない）
  const named = { crawlId: "x", pages: [{ id: "1", url: "https://a.test/", state: "captured", taskId: "t", logReason: "manifest-missing" }] };
  assert.equal(pageLog(named, "1").body.reason, "manifest-missing");
  // 数を読んでいないページの logCounts は null
  assert.equal(pageRow(crawlOf("5b0c0006").pages[0]).logCounts, null);
});

test("5b0c0009 のページの表では、WACZ が台帳の指す合本に入った 2 ページにだけ replay ↗ が付く", () => {
  const c = crawlOf("5b0c0009");
  const bundle = crawlDetail(c).replayBundle;
  const pages = pageList(c, query()).body.pages;
  const linked = pages.filter((p) => replayBundleHref("http://127.0.0.1:8899", bundle, p) !== undefined);
  assert.deepEqual(linked.map((p) => [p.id, p.bundledRev]), [["1201", 1], ["1203", bundle.rev]]);
  // 版に入ったページは WACZ と撮った時刻を持つ（合本の中で直に開く）。ほかのページは、どちらも持たない
  for (const p of pages) {
    const bundled = p.bundledRev !== null;
    assert.equal(p.archiveId !== null, bundled, p.id);
    assert.equal(p.capturedAt !== null, bundled, p.id);
    if (bundled) assert.match(replayBundleHref("http://127.0.0.1:8899", bundle, p), /#view=replay&/, p.id);
  }
});

test("ページの id が数字だけでなければ 400、ほかの行のページと、行が無ければ 404", () => {
  const c = crawlOf("5b0c0009");
  assert.equal(pageLog(c, "12a").status, 400);
  assert.equal(pageLog(undefined, "12a").status, 400);
  assert.deepEqual(pageLog(c, "601"), { status: 404, body: { error: "not found" } });
  assert.deepEqual(pageLog(undefined, "1202"), { status: 404, body: { error: "not found" } });
});

test("failures の要素は { url, depth, reason, page } で、page は同じ行の pages の、同じ URL の failed の行を指す", () => {
  let seen = 0;
  for (const c of scenario.crawls) {
    for (const f of crawlDetail(c).failures) {
      seen += 1;
      assert.deepEqual(Object.keys(f), ["url", "depth", "reason", "page"]);
      const p = (c.pages ?? []).find((x) => x.id === f.page);
      assert.ok(p !== undefined, `${c.crawlId} ${f.page}`);
      assert.deepEqual([p.url, p.state, p.reason], [f.url, "failed", f.reason], `${c.crawlId} ${f.page}`);
    }
  }
  assert.ok(seen > 0);
});

test("台本の 5b0c0009 は、時間切れのページ（warn と error の行）と、捨てた行・途中で切った行を持つ", () => {
  const c = crawlOf("5b0c0009");
  const rows = pageList(c, query()).body.pages;
  const timedOut = rows.find((p) => p.state === "failed" && p.reason.startsWith("timeout"));
  assert.ok(timedOut !== undefined, "時間切れのページ");
  assert.ok(timedOut.logCounts.error > 0, "時間切れのページにも error の行");
  assert.ok(rows.some((p) => p.logCounts?.warn > 0), "warn の行");
  assert.ok(rows.some((p) => p.logCounts === null), "数を読んでいないページ");
  const logs = rows.map((p) => pageLog(c, p.id).body.log).filter((log) => log !== null);
  assert.ok(logs.some((log) => log.dropped > 0), "捨てた行");
  assert.ok(logs.some((log) => log.lines.some((line) => line.truncated === true)), "途中で切った行");
  // 行が名指すスクリプトは、このクロールが走らせた物
  const ran = new Set(crawlDetail(c).scripts.map((s) => s.id));
  for (const log of logs) for (const line of log.lines) if (line.script !== undefined) assert.ok(ran.has(line.script), line.script);
});

test("代役は、型で落ちた 5b0c0008 に取り直した型の誤りを返し、その場の JS に直し方を訊ける", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0008"));
  // 画面が取り直しに行くのは、失敗の文が型の検査で落ちたと言う行だけ
  assert.equal(failedOnTypes(crawlDetail(c).error), true);
  const answer = diagnosticsOf(c);
  assert.equal(answer.status, 200);
  const said = diagnosisOf(answer.status, answer.body);
  assert.equal(said.kind, "errors");
  assert.deepEqual(said.rows.map((r) => `${r.where}:${r.at} ${r.code}`), ["inline-close-banner:2:18 TS7006"]);
  assert.equal(hasErrorsIn(said, "inline-close-banner"), true);
  // 直し方は検査に通った案。差分を元の source に当てると、直した版になる
  const fix = fixOf(c, "close-banner");
  assert.equal(fix.status, 200);
  assert.equal(fixAnswer(fix.status, fix.body).kind, "ok");
  const lines = c.scripts.find((x) => x.id === "inline-close-banner").inline.source.replace(/\n$/, "").split("\n");
  for (const edit of [...fix.body.edits].reverse()) {
    assert.deepEqual(lines.slice(edit.from - 1, edit.to), edit.before);
    lines.splice(edit.from - 1, edit.to - edit.from + 1, ...edit.after);
  }
  assert.equal(`${lines.join("\n")}\n`, fix.body.source);
});

test("代役は Claude を呼ばない —— 台本に無い行・名前の直し方は 404、型で落ちていない行の取り直しは型を通る答え", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0008"));
  assert.equal(fixOf(c, "other").status, 404);
  assert.equal(fixOf(undefined, "close-banner").status, 404);
  const passing = scenario.crawls.find((x) => x.state === "succeeded");
  assert.equal(fixOf(passing, "search").status, 404);
  assert.deepEqual(diagnosisOf(200, diagnosticsOf(passing).body).kind, "clean");
  assert.equal(diagnosticsOf(undefined).status, 404);
});

test("代役の 5b0c0008（型で落ちた行）は、起点の頁を pending のまま持つ（台帳と同じ。画面は報告なしと添える）", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0008"));
  const answer = pageList(c, new URLSearchParams());
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.pages.map((p) => [p.url, p.state]), [["https://sandbox.test/news", "pending"]]);
  assert.equal(outcomeOf(answer.body.pages[0], c.state), "pending（報告なし —— クロールが先に終わった）");
});
