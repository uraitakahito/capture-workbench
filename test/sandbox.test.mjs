/**
 * サンドボックスの代役 (sandbox/fake-ledger.mjs) の、応答を組み立てる部分。
 *
 * 欄の集合を capture-ledger の応答と揃えておくことと、同梱の台本が画面の状態を全部出せることを固定する。
 * capture-ledger の欄は capture-ledger v0.57.4 から写した —— capture-ledger が欄を足したら、ここと代役を直す。
 * スクリプトを読むエンドポイント（版の一覧・1 版・受け皿の型）は v0.60.0 から、対象サイト（`sites`）と起点で選ぶ既定は v0.61.0 から。
 * 規則の並び（`rules`・400 の 3 つ・確かめと判断のエンドポイント）は v0.62.0 から。既定に入らないスクリプト（一覧の
 * `enabled`・名指しは有効かどうかを見ない）は v0.64.0 から。クロールごとの値（版の `params`・頼みの `variables`・
 * 行の `variables`/`secrets`・値の 400 の 4 つ）は v0.67.0 から。シークレットの宣言の `archive`（行の `secrets` の
 * `archive`・食い違いの `conflicting params`・隠せない形式の 400）は v0.90.0 から。ページのエンドポイント（`GET /api/crawls/:id/pages` と
 * `…/pages/:page/log`）と failures の `page` は、CAPTURE-18 で capture-ledger が足す形から（capture-ledger の版は、エンドポイントが出たら書く）。
 * 型の誤りの取り直し（`GET /api/crawls/:id/diagnostics`）と直し方（`POST …/inline/:name/fix`）は CAPTURE-49 の形から。
 * 合本の欄（行と詳しい所の `replayBundle`・ページの行の `capturedAt` と `bundledRev`）は、CAPTURE-56 で capture-ledger が足す形から
 * （capture-ledger の版は、出たら書く）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { stateOf } from "../public/format.js";
import { outcomeOf } from "../public/pages.js";
import { axisOf, settleOf, stepsOf, stoppedStepOf } from "../public/timeline.js";
import { isPartialBundle, replayBundleHref } from "../public/replayweb.js";
import { diagnosisOf, failedOnTypes, fixAnswer, hasErrorsIn } from "../public/fix.js";
import { asTemplate, defaultIds, seedHosts } from "../public/start.js";
import {
  archiveRows,
  catalogOf,
  crawlDetail,
  crawlRow,
  createSchedule,
  scheduleRow,
  changeDetail,
  changeRuns,
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
  pageTrace,
  pickable,
  readingLastGood,
  replayBundleOf,
  scenarioAt,
  scriptRows,
  searchOf,
  signedUrlOf,
  checkInline,
  readDeclared,
  submitCrawl,
  submittedRow,
  versionOf,
  versionsOf,
  linkGraphOf,
  pageLinksOf,
} from "../sandbox/fake-ledger.mjs";

const scenario = JSON.parse(readFileSync(new URL("../sandbox/scenario.json", import.meta.url), "utf8"));
/** 台本のスクリプト（版の並び。source は sandbox/catalog の写し —— capture-scripts のファイル）。 */
const versions = catalogOf(scenario);
/** 版を `id@版` で並べる（既定の顔ぶれ・走らせたものを 1 行で比べる）。 */
const at = (list) => list.map((v) => `${v.id}@${String(v.version)}`);
const NOW = Date.parse("2026-10-12T12:00:00.000Z");

/** capture-ledger の src/api/crawls.ts が /api/crawls の 1 行に返す欄 (v0.57.4。`replayBundle` は CAPTURE-56 から、`pagesFailed` は v0.77.0 から)。 */
const LEDGER_CRAWL_KEYS = [
  "crawlId",
  "state",
  "stopReason",
  "seeds",
  "requestedBy",
  "orgId",
  "startedAt",
  "finishedAt",
  "maxDepth",
  "pagesDiscovered",
  // リンクを 1 本ずつ残したクロールか (capture-ledger CAPTURE-246)
  "linksRecorded",
  "pagesCaptured",
  "pagesFailed",
  "error",
  "waczCount",
  "lastJob",
  // 一番新しい段を Windmill に投げた様子 (capture-ledger CAPTURE-180)
  "dispatch",
  "replayBundle",
  "schedule",
  "scheduledFor",
  "scheduleMissed",
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

/** capture-ledger の src/api/schedules.ts が /api/schedules の 1 行に返す欄 (CAPTURE-173)。 */
const LEDGER_SCHEDULE_KEYS = [
  "id",
  "name",
  "orgId",
  "cron",
  "timezone",
  "enabled",
  "health",
  "blockedBy",
  "nextRunAt",
  "runRequestedAt",
  "seeds",
  "maxDepth",
  "maxPages",
  "scripts",
  "outdated",
  "pinnedAt",
  "createdBy",
  "createdAt",
  "recentRuns",
].sort();
const LEDGER_SCHEDULE_RUN_KEYS = [
  "crawlId",
  "state",
  "scheduledFor",
  "startedAt",
  "finishedAt",
  "scheduleMissed",
  "pagesCaptured",
  "pagesFailed",
  "error",
  "change",
].sort();

test("予定の 1 行は、capture-ledger の /api/schedules と同じ欄を持つ", () => {
  for (const c of scenario.schedules) {
    const row = scheduleRow(c);
    assert.deepEqual(Object.keys(row).sort(), LEDGER_SCHEDULE_KEYS, c.id);
    for (const run of row.recentRuns) {
      assert.deepEqual(Object.keys(run).sort(), LEDGER_SCHEDULE_RUN_KEYS, run.crawlId);
    }
  }
});

/**
 * capture-ledger の src/api/changes.ts の一覧の 1 行と、1 本の答え・ページの欄 (v0.93.0・CAPTURE-167)。v0.95.0 から
 * 前の回は prev、1 本の答えに同じだったページの unchanged (CAPTURE-236)。
 */
const LEDGER_CHANGE_RUN_KEYS = [
  "crawlId",
  "scheduleId",
  "scheduleName",
  "startedAt",
  "scheduledFor",
  "prev",
  "state",
  "pagesCompared",
  "pagesChanged",
  "significance",
  "headline",
  "error",
  "restricted",
].sort();
const LEDGER_CHANGE_PAGE_KEYS = [
  "url",
  "stage",
  "state",
  "added",
  "removed",
  "hunks",
  "significance",
  "headline",
  "quotes",
  "before",
  "after",
].sort();
const LEDGER_CHANGE_PREV_KEYS = ["crawlId", "startedAt", "scheduledFor"].sort();
const LEDGER_UNCHANGED_PAGE_KEYS = ["url", "stage", "before", "after"].sort();

test("前回からの変化の答えは、capture-ledger の /api/changes・/api/crawls/:id/changes と同じ欄を持つ", () => {
  const runs = changeRuns(scenario);
  assert.ok(runs.length > 0);
  for (const run of runs) {
    assert.deepEqual(Object.keys(run).sort(), LEDGER_CHANGE_RUN_KEYS, run.crawlId);
    if (run.prev !== null) assert.deepEqual(Object.keys(run.prev).sort(), LEDGER_CHANGE_PREV_KEYS, run.crawlId);
  }
  const details = runs.map((run) => changeDetail(scenario, run.crawlId)).filter((detail) => detail !== undefined);
  assert.ok(details.length > 1);
  assert.equal(details[0].summary.evidence, false);
  for (const detail of details) {
    assert.deepEqual(Object.keys(detail).sort(), [...LEDGER_CHANGE_RUN_KEYS, "summary", "pages", "unchanged"].sort());
    for (const page of detail.pages) assert.deepEqual(Object.keys(page).sort(), LEDGER_CHANGE_PAGE_KEYS, page.url);
    for (const page of detail.unchanged) assert.deepEqual(Object.keys(page).sort(), LEDGER_UNCHANGED_PAGE_KEYS, page.url);
    // 回の WACZ を全部見てよい代役では、違ったページと同じだったページを足すと比べた数
    assert.equal(detail.pages.length + detail.unchanged.length, detail.pagesCompared, detail.crawlId);
  }
  assert.equal(changeDetail(scenario, "5c0d0000-0000-4000-8000-000000000000"), undefined);
});

test("同梱の台本は、定期実行の見本を 3 つ出す（失敗・順番待ち・止めた予定）", () => {
  assert.deepEqual(scenario.schedules.map((c) => c.health), ["failing", "blocked", "paused"]);
});

test("予定を作るエンドポイントは、capture-ledger と同じ文で断る", () => {
  assert.equal(createSchedule([], { name: " ", cron: "0 4 * * *" }).body.error, "name must not be blank");
  assert.deepEqual(createSchedule([], { name: "a", cron: "0 0 4 * * *" }).body, {
    error: "invalid cron",
    hint: "cron must have 5 fields",
    hints: [{ text: "cron must have 5 fields" }],
  });
  assert.equal(createSchedule([], { name: "a", cron: "*/5 * * * *" }).body.error, "cron runs too often");
  assert.equal(createSchedule([{ name: "a" }], { name: "a", cron: "0 4 * * *" }).status, 409);
  const made = createSchedule([], { name: " a ", cron: "0 4 * * *", request: { seeds: ["https://site.test/"] } });
  assert.equal(made.status, 201);
  assert.equal(made.row.name, "a");
  assert.deepEqual(made.row.seeds, ["https://site.test/"]);
});

test("クロールの 1 行は、capture-ledger の /api/crawls と同じ欄を持つ", () => {
  for (const c of scenario.crawls) {
    assert.deepEqual(Object.keys(crawlRow(c, NOW)).sort(), LEDGER_CRAWL_KEYS, c.crawlId);
  }
});

// ── 始めるエンドポイント（POST /api/crawls）。文は capture-ledger v0.57.5 の src/api/crawls.ts から写した ──

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

test("読めない起点・空の起点・seeds の無い body は、capture-ledger と同じ文で 400", () => {
  const rows = [];
  const say = (body) => submitCrawl(rows, body, NOW, RUNS, versions);
  assert.deepEqual(say({}), { status: 400, body: { error: "seeds is required" } });
  assert.equal(say({ seeds: [] }).body.message, "body/seeds must NOT have fewer than 1 items");
  assert.equal(say({ fromTargets: {} }).status, 400);
  for (const seed of ["ftp://site.test/", "not a url", "site.test"]) {
    assert.deepEqual(say({ seeds: ["https://site.test/", seed] }), {
      status: 400,
      body: { error: "every seed must be an http(s) URL" },
    });
  }
  assert.equal(rows.length, 0, "断った本は行にしない");
});

test("受けた行も、capture-ledger の /api/crawls と同じ欄を持つ", () => {
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
  for (const text of ["走行中", "完走", "完走・1 枚取れず", "打ち切り (深さ)", "打ち切り (枚数)", "失敗"]) {
    assert.ok(texts.has(text), text);
  }
  assert.ok([...texts].some((text) => text.startsWith("成功 (")), "知らない stopReason の行");
  assert.ok((scenario.hidden ?? []).length > 0, "見えない archive の行");
});

// ── 合本の欄（CAPTURE-56 で capture-ledger が足す行の replayBundle）────────────────────────────────

test("合本の欄は capture-ledger と同じ形で、行と詳しい所で同じ。鍵は capture-ledger と同じ置き場の版を指す", () => {
  let seen = 0;
  for (const c of scenario.crawls) {
    const bundle = crawlRow(c, NOW).replayBundle;
    assert.deepEqual(crawlDetail(scenarioAt(c, NOW)).replayBundle, bundle, c.crawlId);
    if (bundle === null) continue;
    seen += 1;
    assert.deepEqual(Object.keys(bundle).sort(), LEDGER_BUNDLE_KEYS, c.crawlId);
    if (bundle.rev === null) {
      // 失敗だけの行は、鍵・ページの数・時刻を持たない（capture-ledger の replayBundleOf と同じ）
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
  assert.ok(bundles.some((b) => b !== null && b.key === null), "失敗だけ（再生のリンクが出ない）");
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

test("クロール 1 本は、workbench が読む seeds・error・scripts・failures を返す", () => {
  const failed = scenario.crawls.find((c) => c.state === "failed" && c.failures?.length > 0);
  const detail = crawlDetail(failed);
  assert.deepEqual(detail.seeds, failed.seeds);
  assert.equal(detail.error, failed.error);
  assert.ok(detail.failures.length > 0);
  // 走らせたものを持たない行は、空の並び（capture-ledger も、何も走らせなければ []）
  assert.deepEqual(detail.scripts, []);
});

test("同梱の台本に、その場の TS で完走した行と、compile の段で落ちた行が在る", () => {
  const withInline = scenario.crawls.filter((c) => c.scripts?.some((s) => s.inline !== undefined));
  assert.deepEqual([...new Set(withInline.map((c) => c.state))].sort(), ["failed", "succeeded"]);
  assert.equal(withInline.filter((c) => c.state === "failed").length, 1, "compile の段で落ちた行は 1 本");
  const broken = crawlDetail(withInline.find((c) => c.state === "failed"));
  assert.match(broken.error, /compile 422 .*inline-close-banner\.ts/);
  // capture-ledger と同じく、その場の物にだけ inline が付き、登録済みのスクリプトは身元だけ
  assert.equal(broken.scripts[0].id, "inline-close-banner");
  assert.equal(broken.scripts[0].inline.name, "close-banner");
  assert.equal("inline" in broken.scripts[1], false);
});

test("scripts を受けると、その場の TS は inline- の id・版 1 で写り、詳しい所には名前・phase・バイト数だけが出る", () => {
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
  // 一覧の行には出さない（欄は capture-ledger の一覧と揃えて固定している）
  assert.equal("scripts" in submittedRow(rows[0], NOW), false);
});

test("名前で引くエンドポイントは、受けた行と台本の行の両方で、その場の TS を source ごと返す", () => {
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

test("名前で引くエンドポイントは、登録済みのスクリプト・知らない名前・知らない行には 404（capture-ledger と同じ文）", () => {
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

test("走行中でも、走らせるものの誤りは 409 より先に 400 —— capture-ledger と同じ順", () => {
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

test("scripts を省くと、起点で選んだ既定を走らせたものとして返す —— 合うサイト用のスクリプトは対象サイトごと", () => {
  const ranFrom = (seed, variables) => {
    const rows = [];
    submitCrawl(rows, { seeds: [seed], ...(variables && { variables }) }, NOW, RUNS, versions);
    return crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts).scripts;
  };
  assert.deepEqual(at(ranFrom("https://other-site.test/")), ["autoscroll@2"]);
  const onSite = ranFrom("https://laws.e-gov.go.jp/", { query: "個人情報" });
  assert.deepEqual(at(onSite), ["autoscroll@2", "egov-law-search@1"]);
  // 対象サイトは capture-ledger v0.61.0 と同じく詳しい所に出る。対象サイトの無い物は空の並び
  assert.deepEqual(
    onSite.map((s) => s.sites),
    [[], ["laws.e-gov.go.jp"]],
  );
});

/** 版を `id@版:enabled` で並べる（一覧のエンドポイントの 1 行が既定に入るかまで比べる）。 */
const atOn = (list) => list.map((v) => `${v.id}@${String(v.version)}:${String(v.enabled)}`);

test("一覧のエンドポイントは各 id に 1 行で、カタログの順 —— 有効な版の中の最新、無ければ最新版を enabled: false で。サイト用も対象サイトつきで", () => {
  assert.deepEqual(atOn(pickable(versions)), ["autoscroll@2:true", "egov-law-search@1:true", "autofetch@1:false"]);
  assert.deepEqual(pickable(versions)[1].sites, ["laws.e-gov.go.jp"]);
  // 新しい版だけを無効にすると、有効な古い版が出る（版ごとの巻き戻し）
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  assert.deepEqual(atOn(pickable(off)), ["autoscroll@1:true", "egov-law-search@1:true", "autofetch@1:false"]);
  // 全部の版を無効にすると、消えずに最新版が enabled: false で出る
  const allOff = versions.map((v) => (v.id === "autoscroll" ? { ...v, enabled: false } : v));
  assert.deepEqual(atOn(pickable(allOff)), ["autoscroll@2:false", "egov-law-search@1:true", "autofetch@1:false"]);
});

test("既定の元（有効な各 id の最新版）は、既定に入らない id を飛ばす", () => {
  assert.deepEqual(at(latestEnabled(versions)), ["autoscroll@2", "egov-law-search@1"]);
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  assert.deepEqual(at(latestEnabled(off)), ["autoscroll@1", "egov-law-search@1"]);
});

test("既定の顔ぶれは、有効な物のうち対象サイトの無い物と、起点に合うサイト用の物 —— autofetch は入らず、ポートは見ない", () => {
  assert.deepEqual(at(defaultSet(versions, new Set())), ["autoscroll@2"]);
  assert.deepEqual(at(defaultSet(versions, seedHosts("https://laws.e-gov.go.jp:8443/a"))), [
    "autoscroll@2",
    "egov-law-search@1",
  ]);
  // 完全一致。同じ e-Gov でも別のホスト（www.e-gov.go.jp）は合わない
  assert.deepEqual(at(defaultSet(versions, seedHosts("https://www.e-gov.go.jp/"))), ["autoscroll@2"]);
});

test("既定は最新版を選んでから対象サイトで絞る —— 対象サイトを付け直した id の、対象サイトの無い古い版は出てこない", () => {
  // capture-ledger v0.61.0 の resolveScripts と同じ順。逆にすると v1 が出てくる
  const resited = [
    ...versions,
    { ...versions[0], id: "google-results", version: 1, sites: [] },
    { ...versions[0], id: "google-results", version: 2, sites: ["www.google.com"] },
  ];
  assert.deepEqual(at(defaultSet(resited, seedHosts("https://other-site.test/"))), ["autoscroll@2"]);
});

test("代役の既定と、新しいクロールの画面の既定（public/start.js）は、同じ起点に同じ顔ぶれを出す", () => {
  // 決まりの正は capture-ledger。2 つの写しが食い違えば、workbench が「省いても同じ」と送った頼みで別の物が走る。
  // workbench が持つのは一覧のエンドポイントの答え（pickable）だけ —— 版ごとに無効にした capture-ledger でも、それで同じ顔ぶれになる
  const off = versions.map((v) => (v.id === "autoscroll" && v.version === 2 ? { ...v, enabled: false } : v));
  const allOff = versions.map((v) => (v.id === "autoscroll" ? { ...v, enabled: false } : v));
  // 版が離れて並び、先に現れた版が無効でも、id の順は最初に現れた所（capture-ledger の順は id に 1 つ）
  const [scroll1, scroll2, egov, fetch1] = versions;
  const apart = [{ ...scroll1, enabled: false }, egov, scroll2, fetch1];
  const seeds = [
    "",
    "https://other-site.test/",
    "https://laws.e-gov.go.jp/",
    "http://laws.e-gov.go.jp:8080/a\nhttps://other-site.test/",
    "https://www.e-gov.go.jp/",
    "not a url\nHTTPS://LAWS.E-GOV.GO.JP/",
  ];
  for (const list of [versions, off, allOff, apart]) {
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

test("既定に入らないスクリプトも、名指せば最新版が走る（capture-ledger v0.64.0）", () => {
  const rows = [];
  const answer = submitCrawl(rows, { seeds: ["https://other-site.test/"], scripts: [{ catalog: "autofetch" }] }, NOW, RUNS, versions);
  assert.equal(answer.status, 202);
  assert.deepEqual(at(crawlDetail(submittedRow(rows[0], NOW), rows[0].scripts).scripts), ["autofetch@1"]);
});

test("起点に合わないサイト用のスクリプトを名指すと、capture-ledger と同じ文で 400 —— 走行中でも 409 より先", () => {
  const rows = [];
  const post = (seeds) =>
    submitCrawl(
      rows,
      { seeds, scripts: [{ catalog: "autofetch" }, { catalog: "egov-law-search" }], variables: { query: "個人情報" } },
      NOW,
      RUNS,
      versions,
    );
  assert.deepEqual(post(["https://other-site.test/"]), {
    status: 400,
    body: {
      error: "site scripts need a seed on their site",
      ids: ["egov-law-search"],
      hint: "egov-law-search: laws.e-gov.go.jp",
      hints: [{ text: "egov-law-search: laws.e-gov.go.jp" }],
    },
  });
  // 起点のどれかが合えば通る（ポートは見ない）
  assert.equal(post(["https://other-site.test/", "https://laws.e-gov.go.jp:8443/"]).status, 202);
  assert.equal(post(["https://other-site.test/"]).status, 400);
});

test("既定が空なら 400 —— 登録済みのスクリプトが無いのと、全部が別のサイト用とで文を分ける（capture-ledger と同じ文）", () => {
  const post = (list, body = {}) => submitCrawl([], { seeds: ["https://other-site.test/"], ...body }, NOW, RUNS, list);
  assert.deepEqual(post([]), {
    status: 400,
    body: {
      error: "no scripts are registered",
      hint: "pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])",
      // 鍵の無い組。終わりの案内も 1 つの組（capture-ledger の crawl/prepare.ts と同じ）
      hints: [{ text: "pnpm run scripts import .upstream/capture-scripts" }, { text: "(run nothing on purpose: send scripts: [])" }],
    },
  });
  const onlySite = versions.filter((v) => v.id === "egov-law-search");
  assert.deepEqual(post(onlySite), {
    status: 400,
    body: {
      error: "no default scripts for these seeds",
      hint: "egov-law-search: laws.e-gov.go.jp (run nothing on purpose: send scripts: [])",
      hints: [{ text: "egov-law-search: laws.e-gov.go.jp" }, { text: "(run nothing on purpose: send scripts: [])" }],
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

test("1 版は source を持ち、sha256 と bytes は source から数える（写しは capture-scripts v0.13.1）", () => {
  const fetch1 = versionOf(versions, "autofetch", "1");
  assert.equal(fetch1.status, 200);
  assert.equal(fetch1.body.sha256.slice(0, 12), "f24100fd1c9b");
  assert.equal(fetch1.body.bytes, 4778);
  const scroll1 = versionOf(versions, "autoscroll", "1").body;
  assert.equal(scroll1.sha256.slice(0, 12), "f5379a5d3323");
  assert.equal(scroll1.bytes, 2700);
  assert.match(scroll1.source.split("\n")[32], /remainingMs < stepDelayMs \+ settleMs/);
  // v0.7.0 から report は id を取らない（写しが古いままなら、ここで分かる）
  assert.match(scroll1.source.split("\n")[47], /globalThis\.__bh\.report\(\{$/);
  // egov-law-search は v0.7.0 で途中の様子を log に書く形になり、v0.11.0 で必須の変数 query を defineParams で読む形になった。
  // v0.12.0 から capture-ledger が読むのは generated/ の物で、見分けの行に sites が書き込まれている
  const egov1 = versionOf(versions, "egov-law-search", "1").body;
  assert.equal(egov1.sha256.slice(0, 12), "09fddfea0306");
  assert.equal(egov1.bytes, 3376);
  assert.match(egov1.source.split("\n")[17], /const \{ query \} = defineParams\($/);
  assert.match(egov1.source.split("\n")[45], /__bh\.log\.warn\("検索窓が無い"/);
  assert.deepEqual(versionOf(versions, "autoscroll", "2").body.options, { maxSteps: 60 });
  assert.deepEqual(versionOf(versions, "autoscroll", "9"), { status: 404, body: { error: "not found" } });
  assert.equal(versionOf(versions, "autoscroll", "abc").body.message, "params/version must be integer");
  assert.equal(versionOf(versions, "autoscroll", "0").body.message, "params/version must be >= 1");
});

test("受け皿の型は台本の file の中身。台本に無ければ 404（型を取り込んでいない capture-ledger）", () => {
  const types = hostTypesOf(scenario);
  assert.equal(types.status, 200);
  assert.equal(types.body.version, 1);
  assert.equal(types.body.bytes, Buffer.byteLength(types.body.source, "utf8"));
  // 写しは capture-scripts v0.13.1（log が在り、report は data だけを取る。変数は defineParams で読み、__bh.vars は型に無い。
  // secrets の注記は、WARC から既定で隠す動きと keep を言う）
  assert.equal(types.body.sha256.slice(0, 12), "a13c44ec770e");
  assert.equal(types.body.bytes, 4248);
  assert.match(types.body.source, /warn\(message: string, data\?: object\): void;/);
  assert.match(types.body.source, /report\(data: object\): void;/);
  assert.match(types.body.source, /declare function defineParams</);
  assert.doesNotMatch(types.body.source, /^\s*vars:/m);
  assert.match(types.body.source, /\*\*WARC からは既定で隠す\*\*/);
  assert.match(types.body.source, /`archive: "keep"` と書いたシークレットだけは/);
  const { hostTypes: _hostTypes, ...without } = scenario;
  assert.deepEqual(hostTypesOf(without), { status: 404, body: { error: "not found" } });
});

test("台本のクロールが走らせた登録済みのスクリプトは、capture-ledger のその版と同じ sha256（5b0c0008 の autoscroll だけはわざと違う）", () => {
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

test("知らないスクリプトの id・重ね・形の誤り・scriptIds は、capture-ledger と同じ文で 400", () => {
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
  // 文は capture-ledger v0.58.0 が Fastify の schema で返す物（workbench は message を出す）
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
/** `fields` を defineParams で宣言するその場の TS。 */
const declaring = (name, fields) => ({
  inline: { name, phase: "behavior", source: `import { z } from "zod";\nconst v = defineParams(z.object({ ${fields} }));\n` },
});

test("一覧と 1 版のエンドポイントは宣言（params）を運ぶ —— egov-law-search は必須の変数 query を宣言し、ほかは空", () => {
  const list = scriptRows(versions);
  assert.deepEqual(list.find((v) => v.id === "egov-law-search").params, [
    { name: "query", kind: "variable", required: true, summary: "法令名の検索語", schema: { type: "string", minLength: 1 } },
  ]);
  assert.deepEqual(list.find((v) => v.id === "autoscroll").params, []);
  // 一覧の行の欄は、身元と対象サイトと enabled と宣言だけ（source・options・bytes は 1 版のエンドポイント）
  for (const row of list) {
    assert.deepEqual(Object.keys(row).sort(), ["enabled", "id", "params", "phase", "sha256", "sites", "version"]);
  }
  assert.deepEqual(
    versionOf(versions, "egov-law-search", "1").body.params.map((p) => p.name),
    ["query"],
  );
});

test("知らない鍵は schema の 400 で、capture-ledger の鍵（maxDepth・variables）は通る。variables の形の誤りも schema の 400", () => {
  const post = (body) => submitCrawl([], { seeds: ["https://laws.e-gov.go.jp/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.equal(post({ foo: 1 }).body.message, "body must NOT have additional properties");
  assert.equal(post({ maxDepth: 2, variables: { query: "個人情報" } }).status, 202);
  assert.equal(post({ variables: { query: "個人情報" } }).status, 202);
  assert.equal(post({ variables: [] }).body.message, "body/variables must be object");
  assert.equal(post({ variables: { Query: "x" } }).body.message, "body/variables property name must be valid");
  assert.equal(post({ variables: { query: 1 } }).body.message, "body/variables/query must be string");
  assert.equal(
    post({ variables: { query: "x".repeat(4097) } }).body.message,
    "body/variables/query must NOT have more than 4096 characters",
  );
});

test("必須の変数が無ければ、ほかの値の誤りより先に 400 で名指し、行を立てない —— 登録済みのスクリプトもその場の TS も", () => {
  const rows = [];
  const post = (body) => submitCrawl(rows, { seeds: ["https://laws.e-gov.go.jp/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.deepEqual(post({}), {
    status: 400,
    body: {
      error: "missing variables",
      names: ["query"],
      diagnostics: [{ file: "egov-law-search.ts", code: "BH0001", message: "必須の変数 query が渡されていない" }],
    },
  });
  // 知らない名前を一緒に送っても、先に言うのは足りない名前
  assert.deepEqual(post({ variables: { qeury: "x" } }).body.names, ["query"]);
  const onSite = (body) => submitCrawl(rows, { seeds: ["https://site.test/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.deepEqual(onSite({ scripts: [declaring("a", 'q: z.string()'), declaring("b", 'r: z.string(), q: z.string()')] }).body, {
    error: "missing variables",
    names: ["q", "r"],
    diagnostics: [
      { file: "inline-a.ts", code: "BH0001", message: "必須の変数 q が渡されていない" },
      { file: "inline-b.ts", code: "BH0001", message: "必須の変数 r が渡されていない" },
      { file: "inline-b.ts", code: "BH0001", message: "必須の変数 q が渡されていない" },
    ],
  });
  assert.equal(rows.length, 0, "断った本は行にしない");
  // .optional() は渡さなくてよい
  assert.equal(onSite({ scripts: [declaring("a", "q: z.string().optional()")] }).status, 202);
});

test("値は宣言に照らして capture-ledger と同じ順と文で 400 —— 別の種類か形の宣言 → シークレットの名前 → 知らない名前 → 形に合わない", () => {
  const post = (body) => submitCrawl([], { seeds: ["https://site.test/"], ...body }, NOW, RUNS, versions, WINDMILL);
  // 宣言の無い名前は渡せない。宣言の無いその場の TS が在っても同じ（読むなら defineParams で宣言する）
  assert.deepEqual(post({ variables: { qeury: "x" } }), { status: 400, body: { error: "unknown variables", names: ["qeury"] } });
  assert.deepEqual(post({ scripts: [probe()], variables: { anything: "x" } }), {
    status: 400,
    body: { error: "unknown variables", names: ["anything"] },
  });
  // 同じ名前を別の種類か別の形で宣言している —— どちらにも渡せない
  const opt = "q: z.string().optional()";
  assert.deepEqual(post({ scripts: [declaring("a", opt), { inline: { ...declaring("b", "r: z.string().optional()").inline, params: [{ name: "q", kind: "secret" }] } }] }), {
    status: 400,
    body: { error: "conflicting params", names: ["q"] },
  });
  assert.deepEqual(post({ scripts: [declaring("a", opt), declaring("b", "q: z.string().min(1).optional()")] }), {
    status: 400,
    body: { error: "conflicting params", names: ["q"] },
  });
  // 同じ形なら 1 つの変数
  assert.equal(post({ scripts: [declaring("a", opt), declaring("b", opt)], variables: { q: "x" } }).status, 202);
  // シークレットの名前を変数で渡している（記録に値が残る）
  assert.deepEqual(post({ scripts: [probe([{ name: "api_token", kind: "secret" }])], variables: { api_token: "x" } }), {
    status: 400,
    body: { error: "secrets cannot be passed as variables", names: ["api_token"] },
  });
  // 形に合わない値。全部を名指し、理由は hint に、文ごとの鍵と値の組は hints に（hint は組の文を " / " で繋いだ字）
  const typed = declaring("a", 'level: z.enum(["low", "high"]), word: z.string().min(2).max(3), code: z.string().length(2)');
  assert.deepEqual(post({ scripts: [typed], variables: { level: "mid", word: "x", code: "abc" } }), {
    status: 400,
    body: {
      error: "invalid variables",
      names: ["code", "level", "word"],
      hint: "code は 2 字まで / level は low・high のどれか / word は 2 字以上",
      hints: [
        { key: "variables.tooLong", params: { name: "code", max: 2 }, text: "code は 2 字まで" },
        { key: "variables.notInEnum", params: { name: "level", values: ["low", "high"] }, text: "level は low・high のどれか" },
        { key: "variables.tooShort", params: { name: "word", min: 2 }, text: "word は 2 字以上" },
      ],
    },
  });
  assert.deepEqual(post({ scripts: [typed], variables: { level: "low", word: "abcd", code: "ab" } }).body.hint, "word は 3 字まで");
  // 長さは code point で数える（capture-ledger の Ajv の決まりと同じ）
  assert.equal(post({ scripts: [typed], variables: { level: "low", word: "𠮷野", code: "𠮷野" } }).status, 202);
});

test("その場の TS の params に変数は書けない。宣言の形の誤りは schema の 400、同じ名前が 2 度あるのは capture-ledger の handler の 400", () => {
  const post = (body) => submitCrawl([], { seeds: ["https://site.test/"], ...body }, NOW, RUNS, versions, WINDMILL);
  assert.deepEqual(post({ scripts: [probe([{ name: "q", kind: "variable", required: true, summary: "語" }])] }), {
    status: 400,
    body: {
      error: "invalid params",
      script: "inline-probe",
      hint: "params に書けるのはシークレットだけ。変数は source の defineParams で宣言する",
      // 値を埋めない文は、params の欄ごと無い
      hints: [{ key: "inlineParams.secretsOnly", text: "params に書けるのはシークレットだけ。変数は source の defineParams で宣言する" }],
    },
  });
  assert.equal(
    post({ scripts: [probe([{ name: "Q", kind: "variable", summary: "語" }])] }).body.message,
    'body/scripts/0/inline/params/0/name must match pattern "^[a-z][a-z0-9_]*$"',
  );
  assert.equal(
    post({ scripts: [probe([{ name: "q", kind: "token", summary: "語" }])] }).body.message,
    "body/scripts/0/inline/params/0/kind must be equal to one of the allowed values",
  );
  assert.equal(
    post({ scripts: [probe([{ name: "q", kind: "secret", default: "x" }])] }).body.message,
    "body/scripts/0/inline/params/0 must NOT have additional properties",
  );
  assert.deepEqual(post({ scripts: [probe([{ name: "q", kind: "secret" }, { name: "q", kind: "secret" }])] }), {
    status: 400,
    body: {
      error: "invalid params",
      script: "inline-probe",
      hint: "params に q が 2 度ある",
      hints: [{ key: "params.duplicateName", params: { name: "q" }, text: "params に q が 2 度ある" }],
    },
  });
});

test("その場の TS のシークレットの宣言は archive: \"keep\" を持てる。ほかの値は capture-ledger v0.90.0 の schema と同じ文で 400", () => {
  const post = (archive) =>
    submitCrawl([], { seeds: ["https://site.test/"], scripts: [probe([{ name: "q", kind: "secret", archive }])] }, NOW, RUNS, versions, WINDMILL);
  assert.equal(post("keep").status, 202);
  // 文は capture-ledger と同じ Fastify の設定（removeAdditional: false・既定の coerceTypes）で、capture-ledger の schema に当てて写した（2026-11-11）。
  // 数・真偽・null は文字列に読み替えられてから enum で断られ、読み替えられない object だけが型の文になる
  for (const archive of ["drop", "", 1, true, null]) {
    assert.equal(
      post(archive).body.message,
      "body/scripts/0/inline/params/0/archive must be equal to one of the allowed values",
      JSON.stringify(archive),
    );
  }
  assert.equal(post({}).body.message, "body/scripts/0/inline/params/0/archive must be string");
});

test("代役の読み手は、見本の形の defineParams を本物と同じ形の宣言にする", () => {
  // 本物の capture-scripts の egov-law-search と、台本の見本
  const egov = versionOf(versions, "egov-law-search", "1").body;
  assert.deepEqual(readDeclared(egov.source), egov.params);
  const sample = scenario.crawls.find((c) => c.crawlId.startsWith("5b0c0007")).scripts[0].inline.source;
  assert.deepEqual(readDeclared(sample), [
    { name: "query", kind: "variable", required: true, summary: "ニュースの検索語", schema: { type: "string", minLength: 1 } },
  ]);
  assert.deepEqual(
    readDeclared('const p = defineParams(\n  z.object({\n    level: z.enum(["low", "high"]).optional(),\n    word: z\n      .string()\n      .max(9)\n      .describe("語 \\"x\\""),\n    code: z.string().length(2),\n  }),\n);'),
    [
      { name: "level", kind: "variable", required: false, schema: { type: "string", enum: ["low", "high"] } },
      { name: "word", kind: "variable", required: true, summary: '語 "x"', schema: { type: "string", maxLength: 9 } },
      { name: "code", kind: "variable", required: true, schema: { type: "string", minLength: 2, maxLength: 2 } },
    ],
  );
  assert.deepEqual(readDeclared("x;"), []);
});

test("POST /api/scripts/check は宣言を返し、行を立てない。欄が出ない理由は diagnostics で、形の誤りは schema の 400", () => {
  const source = declaring("a", 'word: z.string().describe("語")').inline.source;
  const word = { name: "word", kind: "variable", required: true, summary: "語", schema: { type: "string" } };
  assert.deepEqual(checkInline({ source, phase: "behavior" }), { status: 200, body: { params: [word], diagnostics: [] } });
  assert.deepEqual(checkInline({ source: "x;", phase: "behavior" }), { status: 200, body: { params: [], diagnostics: [] } });
  assert.deepEqual(checkInline({ source: "x;", phase: "preload" }).body.diagnostics, []);
  assert.deepEqual(checkInline({ source, phase: "preload" }).body.diagnostics, [
    { file: "inline-check.ts", code: "BH0004", message: "preload では defineParams を使えない (受け皿が無い)" },
  ]);
  assert.deepEqual(checkInline({ source: "const v = defineParams(schema);", phase: "behavior" }).body, {
    params: [],
    diagnostics: [{ file: "inline-check.ts", code: "BH0002", message: "defineParams の引数を読めない (z.object({ … }) をその場に書く)" }],
  });
  assert.equal(checkInline({ source: "x;" }).body.message, "body must have required property 'phase'");
  assert.equal(checkInline({ phase: "behavior" }).body.message, "body must have required property 'source'");
  assert.equal(checkInline({ source: 1, phase: "behavior" }).body.message, "body/source must be string");
  assert.equal(checkInline({ source: "x;", phase: "other" }).body.message, "body/phase must be equal to one of the allowed values");
  assert.equal(checkInline({ source: "x;", phase: "behavior", z: 1 }).body.message, "body must NOT have additional properties");
});

test("宣言したシークレットは Windmill の代わりに照らす —— 無い必須の物は path つきで 400、secret でなければ 400、在れば行に名前と path と WARC に残すか", () => {
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
      hints: [{ text: "wmill variable add <value> f/waggle_secrets/nope --secret" }],
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
  assert.equal(post([secret("api_token"), { ...secret("login"), archive: "keep" }], done).status, 202);
  const detail = crawlDetail(submittedRow(rows[0], done), rows[0].scripts, rows[0].rules, {
    variables: rows[0].variables,
    secrets: rows[0].secrets,
  });
  // archive は宣言の写し。省いた宣言は null（隠す）
  assert.deepEqual(detail.secrets, [
    { name: "api_token", path: "f/waggle_secrets/api_token", editedAt: scenario.capturedAt, rotated: null, archive: null },
    { name: "login", path: "f/waggle_secrets/login", editedAt: scenario.capturedAt, rotated: null, archive: "keep" },
  ]);
  assert.deepEqual(detail.variables, {});
});

test("同じ名前のシークレットを、WARC に残す宣言と隠す宣言の両方ですると 400 conflicting params（capture-ledger v0.90.0 と同じ）", () => {
  const post = (scripts) => submitCrawl([], { seeds: ["https://site.test/"], scripts }, NOW, RUNS, versions, WINDMILL);
  const token = (name, archive) => ({ ...probe([{ name: "api_token", kind: "secret", ...(archive && { archive }) }]).inline, name });
  assert.deepEqual(post([{ inline: token("a", "keep") }, { inline: token("b") }]), {
    status: 400,
    body: { error: "conflicting params", names: ["api_token"] },
  });
  // 揃っていれば 1 つのシークレット
  assert.equal(post([{ inline: token("a", "keep") }, { inline: token("b", "keep") }]).status, 202);
  assert.equal(post([{ inline: token("a") }, { inline: token("b") }]).status, 202);
});

test("隠すシークレットを送るのに配備の形式が値を置き換えられない物を頼むなら、capture-ledger v0.90.0 と同じ文で 400。行は立たない", () => {
  const rows = [];
  const post = (params, formats) =>
    submitCrawl(rows, { seeds: ["https://site.test/"], scripts: [probe(params)] }, NOW, RUNS, versions, WINDMILL, formats);
  const token = { name: "api_token", kind: "secret" };
  const login = { name: "login", kind: "secret", archive: "keep" };
  assert.deepEqual(post([token, login], ["wacz", "png", "mhtml", "links"]), {
    status: 400,
    body: {
      error: "formats that cannot hide secrets",
      formats: ["png", "mhtml"],
      names: ["api_token"],
      hint:
        "CAPTURE_LEDGER_CAPTURE_FORMATS の png・mhtml は値を置き換えられない (BrowserHive が断る)。" +
        '形式から外すか、値を WARC に残すなら宣言に archive: "keep" と書く',
      hints: [
        {
          key: "formats.cannotHideSecrets",
          params: { formats: ["png", "mhtml"] },
          text:
            "CAPTURE_LEDGER_CAPTURE_FORMATS の png・mhtml は値を置き換えられない (BrowserHive が断る)。" +
            '形式から外すか、値を WARC に残すなら宣言に archive: "keep" と書く',
        },
      ],
    },
  });
  assert.equal(rows.length, 0, "断った頼みは行にしない");
  // 残すシークレットだけなら、どの形式でも通る
  assert.equal(post([login], ["wacz", "png", "webp", "html", "mhtml"]).status, 202);
  rows.length = 0;
  // 任意で Windmill に無いシークレットは送られないので、断る理由にならない
  assert.equal(post([{ name: "nope", kind: "secret" }, login], ["wacz", "png"]).status, 202);
  rows.length = 0;
  // 形式を渡さなければ capture-ledger の既定（wacz だけ）で、台本も同じ
  assert.equal(post([token]).status, 202);
  assert.deepEqual(scenario.captureFormats, ["wacz"]);
});

test("値の 400 は、走行中でも 409 より先（capture-ledger と同じ順）", () => {
  const rows = [];
  submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW, RUNS, versions, WINDMILL);
  const busy = submitCrawl(rows, { seeds: ["https://site.test/"], variables: { qeury: "x" } }, NOW + 1000, RUNS, versions, WINDMILL);
  assert.equal(busy.status, 400);
  assert.equal(submitCrawl(rows, { seeds: ["https://site.test/"] }, NOW + 1000, RUNS, versions, WINDMILL).status, 409);
});

test("行の詳しい所は variables と secrets を必ず持つ —— 台本の 5b0c0007 は変数 query と、隠すシークレット api_token・残すシークレット login、ほかの行は空", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0007"));
  const detail = crawlDetail(c);
  assert.deepEqual(detail.variables, { query: "個人情報" });
  assert.deepEqual(
    detail.secrets.map((s) => [s.name, s.path, s.rotated, s.archive]),
    [
      ["api_token", "f/waggle_secrets/api_token", null, null],
      ["login", "f/waggle_secrets/login", null, "keep"],
    ],
  );
  // 欄は capture-ledger v0.90.0 の secretsOf と同じ（archive は宣言の写しで、"keep" か null）
  for (const s of detail.secrets) {
    assert.deepEqual(Object.keys(s).sort(), ["archive", "editedAt", "name", "path", "rotated"]);
    assert.ok(Date.parse(s.editedAt) > 0);
  }
  // シークレットの宣言はその場の TS の params に在り、台本の Windmill に両方が置いてある（同じ頼みを送れば通る形）
  assert.deepEqual(
    c.scripts[0].inline.params.map((p) => [p.name, p.kind, p.archive]),
    [
      ["api_token", "secret", undefined],
      ["login", "secret", "keep"],
    ],
  );
  for (const name of ["api_token", "login"]) {
    assert.ok(scenario.windmillSecrets.includes(name), name);
    assert.match(c.scripts[0].inline.source, new RegExp(`__bh\\.secrets\\.${name}\\b`), name);
  }
  const resent = submitCrawl([], { seeds: c.seeds, scripts: [{ inline: c.scripts[0].inline }], variables: c.variables }, NOW, RUNS, versions, WINDMILL);
  assert.equal(resent.status, 202);
  // 台本の sha256 は source の本物の値
  assert.equal(c.scripts[0].sha256, createHash("sha256").update(c.scripts[0].inline.source).digest("hex"));
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

test("アーカイブの 1 行は、capture-ledger の /api/archives と同じ欄を持ち、台本で上書きできる", () => {
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

test("検索のエンドポイントは、写しの行が在るアーカイブでは写しの行だけ、無いアーカイブは文書の行を返し、見えないアーカイブは出さない", () => {
  const answer = ask({ q: "ランプ" });
  assert.equal(answer.status, 200);
  assert.deepEqual(
    answer.body.hits.map((hit) => [hit.objectKey, hit.stage]),
    [
      ["sandbox/datapackage-bad-hash.wacz", null],
      ["sandbox/good.wacz", "after-behaviors"],
    ],
  );
  // total は返した当たりの数（capture-ledger も見せてよい物だけを数える）
  assert.equal(answer.body.total, 2);
  // good.wacz の文書の行も同じ語を含むが、写しの行が在るので引かない。ghost.wacz は見えない
  assert.equal(answer.body.hits.some((hit) => hit.objectKey === "sandbox/ghost.wacz"), false);
});

test("検索の当たり 1 件は、capture-ledger と同じ欄を持ち、写しの URL は urn、文書の URL は取り込んだ URL", () => {
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

test("検索のエンドポイントは、q の無い・空の・ほかの欄のある問いを 400 で断る（capture-ledger の schema と同じ）", () => {
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

test("規則を省けば、capture-ledger の既定（same-origin を辿る 1 本）で固定する", () => {
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

test("規則の 400 は capture-ledger と同じ 3 つの文で、名指す物も同じ形。scope は知らない鍵", () => {
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
  // capture-ledger なら example.co.jp と other.co.jp は別のサイト。代役は co.jp で同じと読む —— docs の development に書いてある
  const answer = submitCrawl(
    rows,
    { seeds: ["https://www.example.co.jp/"], rules: [{ follow: "same-site" }, { skip: "other.co.jp" }] },
    NOW,
    RUNS,
    versions,
  );
  assert.deepEqual(answer.body, { error: "rules that can never match", rules: [{ rule: 2, coveredBy: 1 }] });
});

test("確かめのエンドポイントは、行ごとの読めた種類と覆い、起点ごとのサイトと辿るかを、capture-ledger と同じ形で返す", () => {
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

test("判断のエンドポイントは、台本の行の規則・判断・robots を返す（受けた行は空）", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0007"));
  const answer = decisionsOf(c);
  assert.deepEqual(Object.keys(answer), ["crawlId", "rules", "decisions", "robots"]);
  assert.ok(answer.decisions.length > 0 && answer.robots.length > 0, "画面の絵に出す行がある");
  // 台本の規則は capture-ledger が断らない並びであること（覆われた行を絵に載せない）
  const seeds = c.seeds.map((seed) => new URL(seed).href);
  assert.equal(submitCrawl([], { seeds, rules: c.rules, scripts: [] }, NOW, RUNS, versions).status, 202);
  assert.deepEqual(decisionsOf({ crawlId: "x" }), { crawlId: "x", rules: [{ follow: "same-origin" }], decisions: [], robots: [] });
});

// ── ページのエンドポイント（CAPTURE-18 で capture-ledger が足す GET /api/crawls/:id/pages と …/pages/:page/log の形）────────

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

test("ページの一覧は { pages, next } で、1 行の欄と logCounts の欄は capture-ledger と同じ。id は数字だけの文字列", () => {
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

test("台本の途中の版: 走行中の行と次の版を書けなかった行は途中で、最後の版まで書けた行は途中でない", () => {
  const row = (id) => crawlRow(crawlOf(id), NOW);
  assert.equal(isPartialBundle(row("5b0c0001")), true, "走行中");
  assert.equal(isPartialBundle(row("5b0c0003")), true, "次の版を書けなかった");
  assert.equal(isPartialBundle(row("5b0c0009")), false, "最後の版まで書けた");
  // 詳しい所も一覧の行と同じに読める（開いた行のページの表の再生のリンクが使う）
  for (const id of ["5b0c0001", "5b0c0003", "5b0c0009"]) {
    const detail = crawlDetail(scenarioAt(crawlOf(id), NOW));
    assert.equal(isPartialBundle(detail), isPartialBundle(row(id)), id);
    assert.equal(detail.finishedAt, row(id).finishedAt, id);
  }
});

test("5b0c0009 のページの表では、WACZ が capture-ledger の指す合本に入った 2 ページにだけ再生のリンクが付く", () => {
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

// ── 1 ページの経緯（capture-ledger v0.100.0 の GET /api/crawls/:id/pages/:page/trace。CAPTURE-270）──────
/** capture-ledger の `captureOf`（src/api/trace.ts）が `.result.json` から選ぶ欄。無い欄は鍵ごと出ない。 */
const LEDGER_CAPTURE_KEYS = new Set([
  "status",
  "timestamp",
  "captureProcessingTimeMs",
  "httpStatusCode",
  "errorDetails",
  "settle",
  "waczStats",
  "completeness",
  "document",
  "windowsNotOpened",
]);
const TRACE_SAMPLE = "trace-timeline.wacz";
const SAMPLE_NAMES = readdirSync(new URL("../sandbox/samples/", import.meta.url)).filter((name) => name.endsWith(".wacz"));

test("経緯の答えは { page, archive, capture, log, trace, reason } で、page はページの行に submittedAt と finishedAt を足した物", () => {
  let read = 0;
  for (const c of scenario.crawls.filter((x) => x.pages !== undefined)) {
    for (const p of c.pages) {
      const answer = pageTrace(c, p.id, SAMPLE_NAMES);
      assert.equal(answer.status, 200, `${c.crawlId} ${p.id}`);
      assert.deepEqual(Object.keys(answer.body), ["page", "archive", "capture", "log", "trace", "reason"]);
      const { submittedAt, finishedAt, ...row } = answer.body.page;
      assert.deepEqual(row, pageRow(p));
      assert.deepEqual([submittedAt, finishedAt], [p.submittedAt ?? null, p.finishedAt ?? null]);
      // BrowserHive v30.0.0 から載る欄。capture-ledger v0.100.0 と同じく、いつも null
      assert.equal(answer.body.trace, null);
      // 読めたか読めないかのどちらか: 取り込みの欄が在れば理由は null、無ければ理由が在り、ログも無い
      assert.equal(answer.body.capture === null, answer.body.reason !== null, `${c.crawlId} ${p.id}`);
      if (answer.body.capture === null) {
        assert.equal(answer.body.log, null);
        continue;
      }
      read += 1;
      for (const key of Object.keys(answer.body.capture)) assert.ok(LEDGER_CAPTURE_KEYS.has(key), key);
      for (const key of ["status", "timestamp", "captureProcessingTimeMs"]) assert.ok(key in answer.body.capture, key);
      if (answer.body.log !== null) assert.deepEqual(Object.keys(answer.body.log), ["lines", "counts", "dropped"]);
    }
  }
  assert.ok(read > 0);
});

test("台本の 5b0c000b の 1301 は置き場の trace-timeline.wacz を指し、鍵が出るのは置き場に在る id のときだけ", () => {
  const c = crawlOf("5b0c000b");
  assert.ok(SAMPLE_NAMES.includes(TRACE_SAMPLE), "置き場に見本が在る");
  // id はファイル名から決まる。名前を変えたら、台本の archiveId も変える
  assert.equal(c.pages[0].archiveId, idOf(TRACE_SAMPLE));
  assert.deepEqual(pageTrace(c, "1301", SAMPLE_NAMES).body.archive, {
    id: idOf(TRACE_SAMPLE),
    objectKey: `sandbox/${TRACE_SAMPLE}`,
  });
  // 置き場に無い id（capture-ledger の「見てよくない」と同じ形）は id だけ
  assert.deepEqual(pageTrace(c, "1301", ["good.wacz"]).body.archive, { id: idOf(TRACE_SAMPLE), objectKey: null });
  assert.deepEqual(pageTrace(crawlOf("5b0c0009"), "1201", SAMPLE_NAMES).body.archive, {
    id: crawlOf("5b0c0009").pages[0].archiveId,
    objectKey: null,
  });
  // WACZ の無いページは archive ごと null
  assert.equal(pageTrace(c, "1302", SAMPLE_NAMES).body.archive, null);
});

test("台本の 5b0c000b の答えから、画面は軸・段・待ちを組める。時間切れの 1302 は止まった段を言える", () => {
  const c = crawlOf("5b0c000b");
  const done = pageTrace(c, "1301", SAMPLE_NAMES).body;
  const axis = axisOf(done);
  assert.equal(axis.fromLog, true);
  // 軸の 0 は、最初の行の時刻からその行の ms を引いた所
  assert.equal(axis.originMs, Date.parse(done.log.lines[0].at) - done.log.lines[0].ms);
  assert.deepEqual(
    stepsOf(done.log.lines, axis.endMs).map((bar) => bar.step),
    ["check-address", "start-recording", "load-pages", "write-formats", "package-wacz"],
  );
  assert.equal(settleOf(done.capture.settle, done.log.lines).toMs - settleOf(done.capture.settle, done.log.lines).fromMs, done.capture.settle.waitedMs);
  assert.equal(stoppedStepOf(done), undefined);

  const timedOut = pageTrace(c, "1302", SAMPLE_NAMES).body;
  assert.equal(timedOut.capture.status, "timeout");
  assert.equal(timedOut.capture.errorDetails.timeoutMs, 30000);
  assert.equal(stoppedStepOf(timedOut), "load-pages");
  assert.ok(timedOut.log.lines.some((line) => line.level === "error"));
});

test("経緯を読めないページは capture: null と理由 —— taskId の無いページは not-captured、capture の無いページは no-manifest", () => {
  const skipped = pageTrace(crawlOf("5b0c0009"), "1204", SAMPLE_NAMES).body;
  assert.deepEqual([skipped.capture, skipped.log, skipped.reason], [null, null, "not-captured"]);
  // ログを持つページでも、台本に取り込みの欄が無ければ読めない（代役の省略）
  assert.equal(pageTrace(crawlOf("5b0c0009"), "1201", SAMPLE_NAMES).body.reason, "no-manifest");
  // 台本が理由を名指せる
  const named = { crawlId: "x", pages: [{ id: "1", url: "https://a.test/", state: "captured", taskId: "t", traceReason: "manifest-invalid" }] };
  assert.equal(pageTrace(named, "1").body.reason, "manifest-invalid");
  // ログの無い取り込み（BrowserHive v24.0.0 より前）は、理由にならない: log だけが null
  const old = { crawlId: "x", pages: [{ id: "1", url: "https://a.test/", state: "captured", taskId: "t", capture: { status: "success", timestamp: "2026-10-12T08:40:00.000Z", captureProcessingTimeMs: 900, notPicked: 1 } }] };
  assert.deepEqual(pageTrace(old, "1").body, {
    page: { ...pageRow(old.pages[0]), submittedAt: null, finishedAt: null },
    archive: null,
    capture: { status: "success", timestamp: "2026-10-12T08:40:00.000Z", captureProcessingTimeMs: 900 },
    log: null,
    trace: null,
    reason: null,
  });
});

test("経緯も、ページの id が数字だけでなければ 400、ほかの行のページと、行が無ければ 404", () => {
  const c = crawlOf("5b0c000b");
  assert.equal(pageTrace(c, "13a").status, 400);
  assert.equal(pageTrace(undefined, "13a").status, 400);
  assert.deepEqual(pageTrace(c, "1201"), { status: 404, body: { error: "not found" } });
  assert.deepEqual(pageTrace(undefined, "1301"), { status: 404, body: { error: "not found" } });
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

test("代役は、型で落ちた 5b0c0008 に取り直した型の誤りを返し、その場の TS に直し方を訊ける", () => {
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

test("代役の 5b0c0008（型で落ちた行）は、起点の頁を pending のまま持つ（capture-ledger と同じ。画面は報告なしと添える）", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0008"));
  const answer = pageList(c, new URLSearchParams());
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.pages.map((p) => [p.url, p.state]), [["https://sandbox.test/news", "pending"]]);
  assert.equal(outcomeOf(answer.body.pages[0], c.state), "pending（報告なし —— クロールが先に終わった）");
});

// ── クロールごとの User-Agent（capture-ledger の src/api/crawls.ts の形）──────────────

test("User-Agent は打った字のまま行に残り、詳しい答えが返す。省けば null", () => {
  const start = (body) => {
    const rows = [];
    const answer = submitCrawl(rows, { seeds: ["https://site.test/"], ...body }, NOW, RUNS, versions, WINDMILL);
    return { answer, rows };
  };
  const asked = start({ userAgent: "{chrome} BrowserHive" });
  assert.equal(asked.answer.status, 202);
  assert.equal(crawlDetail(asked.rows[0]).userAgent, "{chrome} BrowserHive");
  const none = start({});
  assert.equal(none.answer.status, 202);
  assert.equal(crawlDetail(none.rows[0]).userAgent, null);
  const blank = start({ userAgent: "   " });
  assert.equal(crawlDetail(blank.rows[0]).userAgent, null);
  for (const userAgent of ["{chrome}", "curl/8.0", "NotBrowserHiveAtAll"]) {
    const unnamed = start({ userAgent });
    assert.equal(unnamed.answer.status, 202);
    assert.equal(crawlDetail(unnamed.rows[0]).userAgent, userAgent);
  }
});

test("User-Agent は capture-ledger と同じ文で断る。行は立たない", () => {
  const refused = (userAgent) => {
    const rows = [];
    const { status, body } = submitCrawl(rows, { seeds: ["https://site.test/"], userAgent }, NOW, RUNS, versions, WINDMILL);
    assert.equal(rows.length, 0);
    // 画面と同じ順で読む（`startAnswer`。schema の 400 は error と message の両方を持つ）
    return [status, body.message ?? body.error];
  };
  assert.deepEqual(refused("クローラー"), [400, "userAgent must be printable ASCII, at most 512 characters"]);
  assert.deepEqual(refused(1), [400, "body/userAgent must be string"]);
});

/**
 * capture-ledger の src/crawl/links-read.ts の `LinkGraph` と `PageLinks` の欄 (v0.99.0・CAPTURE-246)。
 */
const LEDGER_LINK_GRAPH_KEYS = ["crawlId", "recorded", "summary", "pages", "bundles", "hosts", "cross", "crossTruncated"].sort();
const LEDGER_LINK_SUMMARY_KEYS = ["pending", "captured", "failed", "skipped", "maxPages", "maxDepth", "closed", "skip", "nofollow", "hosts"].sort();
const LEDGER_LINK_PAGE_KEYS = ["id", "parent", "depth", "url", "title", "state", "reason", "out", "in"].sort();
const LEDGER_LINK_OUT_KEYS = ["followed", "known", "maxPages", "maxDepth", "closed", "skip", "nofollow"].sort();
const LEDGER_PAGE_LINK_KEYS = ["seq", "url", "text", "rule", "outcome", "to"].sort();

test("リンクの構成の答えは、capture-ledger の /api/crawls/:id/links と同じ欄を持つ", () => {
  const recorded = scenario.crawls.filter((c) => c.linkPages !== undefined);
  assert.ok(recorded.length >= 2, "リンクの記録の在る見本が要る");
  for (const c of scenario.crawls) {
    const graph = linkGraphOf(c);
    assert.deepEqual(Object.keys(graph).sort(), LEDGER_LINK_GRAPH_KEYS, c.crawlId);
    assert.equal(graph.recorded, c.linkPages !== undefined, c.crawlId);
    for (const page of graph.pages) {
      assert.deepEqual(Object.keys(page).sort(), LEDGER_LINK_PAGE_KEYS, `${c.crawlId} ${page.id}`);
      if (graph.recorded) assert.deepEqual(Object.keys(page.out).sort(), LEDGER_LINK_OUT_KEYS, page.id);
      else assert.deepEqual([page.out, page.in], [null, null], page.id);
    }
    if (graph.recorded) assert.deepEqual(Object.keys(graph.summary).sort(), LEDGER_LINK_SUMMARY_KEYS, c.crawlId);
    else assert.equal(graph.summary, null, c.crawlId);
  }
});

test("リンクの構成の数は、URL ごとに数えて足し算が合う（内訳 = 束 + ホスト + 行の在る URL。一覧の数とも合う）", () => {
  for (const c of scenario.crawls.filter((x) => x.linkPages !== undefined)) {
    const graph = linkGraphOf(c);
    const s = graph.summary;
    const bundled = graph.bundles.reduce((n, b) => n + b.urls, 0);
    const hosted = graph.hosts.reduce((n, h) => n + h.urls, 0);
    assert.equal(bundled, s.maxPages + s.maxDepth + s.closed, c.crawlId);
    assert.equal(hosted, s.skip, c.crawlId);
    assert.equal(graph.hosts.length, s.hosts, c.crawlId);
    // 行の在る URL (起点を除く) は、ページの数 − 起点
    const seeds = graph.pages.filter((p) => p.parent === null).length;
    assert.equal(s.pending + s.captured + s.failed + s.skipped, graph.pages.length - seeds, c.crawlId);
    // 一覧の「リンク」(規則が通した別々の URL・起点を除く) と合う
    assert.equal(crawlRow(c, NOW).pagesDiscovered, graph.pages.length - seeds + bundled, c.crawlId);
    assert.equal(crawlRow(c, NOW).linksRecorded, true, c.crawlId);
    // 親は、同じクロールのページか null。木に無い辺の両端もページ
    const ids = new Set(graph.pages.map((p) => p.id));
    for (const p of graph.pages) assert.ok(p.parent === null || ids.has(p.parent), `${c.crawlId} ${p.id}`);
    for (const [from, to] of graph.cross) assert.ok(ids.has(from) && ids.has(to) && from !== to, c.crawlId);
  }
});

test("docs の見本（5b0c0003）: 深さで切った 9 本が 4 つの束に、別のホストは 3 個・4 本", () => {
  const graph = linkGraphOf(scenario.crawls.find((c) => c.crawlId.startsWith("5b0c0003")));
  assert.deepEqual(graph.summary, { pending: 0, captured: 7, failed: 0, skipped: 0, maxPages: 0, maxDepth: 9, closed: 0, skip: 4, nofollow: 0, hosts: 3 });
  assert.deepEqual(graph.bundles, [
    { from: "303", outcome: "max_depth", urls: 3 },
    { from: "305", outcome: "max_depth", urls: 2 },
    { from: "306", outcome: "max_depth", urls: 1 },
    { from: "308", outcome: "max_depth", urls: 3 },
  ]);
  assert.deepEqual(graph.hosts[0], { hostname: "github.test", urls: 2 });
  const root = graph.pages[0];
  // 起点: 次の段に入れた 7・落とした 2。深さ 1 の 7 ページが全部、起点へ戻るリンクを持つ
  assert.deepEqual([root.out.followed, root.out.skip, root.in], [7, 2, 7]);
});

test("検索の見本（5b0c0009）: 行の在る URL は、ページの結末（撮れた・取れず・見送り）で数える", () => {
  const graph = linkGraphOf(scenario.crawls.find((c) => c.crawlId.startsWith("5b0c0009")));
  assert.deepEqual([graph.summary.captured, graph.summary.failed, graph.summary.skipped], [1, 1, 1]);
});

test("1 ページの出入りのリンクは、capture-ledger の /api/crawls/:id/links/:page と同じ欄を持つ", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0003"));
  const { status, body } = pageLinksOf(c, "304");
  assert.equal(status, 200);
  for (const link of body.out) assert.deepEqual(Object.keys(link).sort(), LEDGER_PAGE_LINK_KEYS);
  // ガイドの頁: 起点へ戻る 1・もう行がある 3・落とした 1。行き先のページの id が付く
  assert.deepEqual(body.out.map((link) => [link.outcome, link.to]), [
    ["known", "301"],
    ["known", "305"],
    ["known", "306"],
    ["known", "307"],
    ["skip", null],
  ]);
  assert.equal(body.out[4].rule, 0);
  // 入ってくるのは、起点だけ
  assert.deepEqual(body.in.map((link) => link.from), ["301"]);
  // 規則の頁へは、起点とガイドから
  assert.deepEqual(pageLinksOf(c, "305").body.in.map((link) => link.from), ["301", "304"]);
  assert.equal(pageLinksOf(c, "999").status, 404);
  assert.equal(pageLinksOf(c, "abc").status, 400);
});

test("リンクの記録の無い行は、ページと親だけ。1 ページの出入りは空", () => {
  const c = scenario.crawls.find((x) => x.crawlId.startsWith("5b0c0006"));
  const graph = linkGraphOf(c);
  assert.equal(graph.recorded, false);
  assert.equal(graph.pages.length, c.pages.length);
  assert.deepEqual(pageLinksOf(c, c.pages[0].id).body, { out: [], in: [] });
});
