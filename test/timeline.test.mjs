/**
 * 「経緯」の画面の計算（`public/timeline.js`）。見本（`timeline-sample.json`）は、dev の capture-fixtures を撮った
 * 実物の答え —— 期待値は、その実物から数えた物。実物に無い形（開かせなかったウィンドウ・本文を省いた応答・
 * 失敗の 2 つの理由・方針の 2 つ・切られた行・ログの無い答え・続きの在る一覧）は、手で作った見本で見る。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import sample from "./timeline-sample.json" with { type: "json" };
import {
  applyMetadata,
  axisOf,
  bodyKey,
  consoleOf,
  detailsOf,
  isNoEntry,
  marksOf,
  metadataKind,
  parseTraceHash,
  parseWarcFields,
  percentOf,
  readRecords,
  readsRecords,
  recordPath,
  recordsPath,
  scriptsOf,
  secondsText,
  settleOf,
  stepsOf,
  stoppedStepOf,
  tallyOf,
  ticksOf,
  traceHash,
  tracePath,
  warcName,
} from "../public/timeline.js";

const CRAWL = "93ec38bb-60d9-469c-b659-0cbfc37fb012";
const charset = sample.charset;
const fetchLate = sample.fetchLate;
const timedOut = sample.timedOut;
const WARC = "archive/data-000.warc.gz";

test("URL の形: クロールとページの組だけを読む", () => {
  assert.deepEqual(parseTraceHash(`#trace/${CRAWL}/968`), { crawlId: CRAWL, pageId: "968" });
  assert.equal(parseTraceHash(`#trace/${CRAWL}`), undefined);
  assert.equal(parseTraceHash(`#trace/${CRAWL}/abc`), undefined);
  assert.equal(parseTraceHash(`#links/${CRAWL}/968`), undefined);
  assert.equal(traceHash(CRAWL, "968"), `#trace/${CRAWL}/968`);
  assert.equal(tracePath(CRAWL, "968"), `/api/crawls/${CRAWL}/pages/968/trace`);
  assert.equal(warcName(0), WARC);
  assert.equal(warcName(12), "archive/data-012.warc.gz");
  assert.equal(recordsPath("a b", WARC, 1000), "/wacz/a%20b/records?path=archive%2Fdata-000.warc.gz&from=1000&count=1000");
  assert.equal(recordPath("a", WARC, 13661, 422), "/wacz/a/record?path=archive%2Fdata-000.warc.gz&offset=13661&length=422");
});

test("秒の字", () => {
  assert.equal(secondsText(420), "0.42 秒");
  assert.equal(secondsText(3100), "3.10 秒");
  assert.equal(secondsText(30348), "30.3 秒");
  assert.equal(secondsText(undefined), "—");
});

test("軸の 0 は、ログの最初の行の at − ms（実物: 最初の行は 318 ms）。終わりは timestamp と最後の行の遅い方", () => {
  const axis = axisOf(charset.answer);
  // 最初の行は 02:48:17.127 で ms 318 → 起点は 02:48:16.809
  assert.equal(axis.originMs, Date.parse("2026-11-13T02:48:16.809Z"));
  // 終わった時刻 02:48:19.909 − 起点 = 3,100（最後の行の 3,030 より遅い）
  assert.equal(axis.endMs, 3100);
  assert.equal(axis.fromLog, true);
});

test("ログの無い答えでは、軸の 0 は取り込みの長さの起点（timestamp − captureProcessingTimeMs）", () => {
  const axis = axisOf({ ...charset.answer, log: null });
  assert.equal(axis.originMs, Date.parse("2026-11-13T02:48:19.909Z") - 2782);
  assert.equal(axis.endMs, 2782);
  assert.equal(axis.fromLog, false);
  assert.equal(axisOf({ capture: null, log: null }), undefined);
});

test("取り込みの段の帯は、段の行から次の段の行まで（実物: 5 段）", () => {
  const { endMs } = axisOf(charset.answer);
  assert.deepEqual(stepsOf(charset.answer.log.lines, endMs), [
    { step: "check-address", fromMs: 318, toMs: 378 },
    { step: "start-recording", fromMs: 378, toMs: 386 },
    { step: "load-pages", fromMs: 386, toMs: 2863 },
    { step: "write-formats", fromMs: 2863, toMs: 3030 },
    { step: "package-wacz", fromMs: 3030, toMs: 3100 },
  ]);
});

test("細部の帯は、目印から次の目印か次の段まで", () => {
  const { endMs } = axisOf(charset.answer);
  const details = detailsOf(charset.answer.log.lines, endMs);
  assert.deepEqual(
    details.map((one) => [one.text, one.fromMs, one.toMs]),
    [
      ["navigation, dpr=1", 387, 583],
      ["settle, dpr=1", 583, 2730],
      ["snapshot after-load, dpr=1", 2730, 2863],
      ["behaviors, dpr=1", 2863, 2863],
      ["links", 2868, 2873],
      ["page read", 2873, 2994],
      ["put links", 2994, 3023],
      ["web storage", 3023, 3030],
    ],
  );
  assert.equal(details[0].dpr, 1);
});

test("切られた行（data が文字）は、段の行に数えない", () => {
  const lines = [
    { at: "2026-11-13T00:00:00.100Z", ms: 100, source: "browserhive", level: "info", msg: "step load-pages", data: { step: "load-pages" } },
    { at: "2026-11-13T00:00:00.200Z", ms: 200, source: "browserhive", level: "info", msg: "step x", data: '{"step":"x', truncated: true },
  ];
  assert.deepEqual(stepsOf(lines, 500), [{ step: "load-pages", fromMs: 100, toMs: 500 }]);
});

test("待ちの印は、待ち始めの行の ms を足して軸に載せる（実物: 583 + 2,133 = 2,716）", () => {
  const settle = settleOf(charset.answer.capture.settle, charset.answer.log.lines);
  assert.deepEqual(settle, {
    fromMs: 583,
    toMs: 2716,
    endedBy: "quiet",
    loadMs: 597,
    networkQuietMs: 2599,
    cpuQuietMs: 1702,
    domQuietMs: 2608,
  });
  // ログの「settled by quiet after 2133ms」の行の ms と合う
  const said = charset.answer.log.lines.find((line) => String(line.msg).startsWith("settled by"));
  assert.equal(said.ms, settle.toMs);
  // 待ちの行が無ければ、軸に置けない
  assert.equal(settleOf(charset.answer.capture.settle, []), undefined);
  assert.equal(settleOf(undefined, charset.answer.log.lines), undefined);
});

test("スクリプトの帯は、始めた行と終えた行の対。終えていなければ軸の終わりまで", () => {
  const lines = [
    { ms: 4319, dpr: 1, source: "browserhive", level: "info", msg: "script autoscroll started", data: { script: "autoscroll", index: 0 } },
    { ms: 8108, dpr: 1, source: "script", script: "autoscroll", level: "info", msg: "report", data: { stopped: "bottom" } },
    { ms: 8108, dpr: 1, source: "browserhive", level: "info", msg: "script autoscroll finished after 3789ms", data: { script: "autoscroll", index: 0, elapsedMs: 3789 } },
    { ms: 8200, dpr: 1, source: "browserhive", level: "info", msg: "script slow started", data: { script: "slow", index: 1 } },
  ];
  assert.deepEqual(scriptsOf(lines, 9000), [
    { script: "autoscroll", fromMs: 4319, toMs: 8108, open: false, dpr: 1, failed: false },
    { script: "slow", fromMs: 8200, toMs: 9000, open: true, dpr: 1 },
  ]);
});

test("console の印は、取り込みのページとスクリプトの行だけ", () => {
  const lines = [
    { ms: 1, source: "browserhive", level: "info", msg: "step x", data: { step: "x" } },
    { ms: 417, source: "page", level: "warn", msg: "w" },
    { ms: 419, source: "page", level: "error", msg: "e" },
    { ms: 500, source: "script", level: "info", msg: "report" },
  ];
  assert.deepEqual(consoleOf(lines), [
    { ms: 417, level: "warn", source: "page", msg: "w" },
    { ms: 419, level: "error", source: "page", msg: "e" },
    { ms: 500, level: "info", source: "script", msg: "report" },
  ]);
});

test("時間切れの取り込みは、止まった段をログの最後の段の行から読む（答えは段の名前を運ばない）", () => {
  assert.equal(timedOut.answer.capture.errorDetails.step, undefined);
  assert.equal(stoppedStepOf(timedOut.answer), "load-pages");
  assert.equal(stoppedStepOf(charset.answer), undefined);
  assert.equal(axisOf(timedOut.answer).endMs, 30348);
});

test("レコードを読みに行くのは、WACZ が在り、軸を組める答えだけ（時間切れの実物には WACZ が無い）", () => {
  assert.equal(readsRecords(charset.answer), true);
  assert.equal(timedOut.answer.archive, null);
  assert.equal(readsRecords(timedOut.answer), false);
  // 取り込みの答えが無いページ（軸を組めない）は、WACZ の id が在っても読まない
  assert.equal(readsRecords({ ...charset.answer, capture: null, log: null, reason: "manifest-missing" }), false);
});

test("request と response は 1 つの対にまとめ、位置は WARC-Date − 起点（実物: 対 11・写し 1）", () => {
  const { originMs } = axisOf(charset.answer);
  const marks = marksOf([{ path: WARC, records: charset.records }], originMs);
  // 対の数は、取り込みの答えの数と同じ
  assert.equal(marks.exchanges.length, charset.answer.capture.waczStats.totalRecorded);
  assert.equal(marks.exchanges.length, 11);
  // 主文書の対は 02:48:17.261 → 452 ms。ログの「navigation」（387）と「settle」（583）の間
  assert.equal(marks.exchanges[0].uri, "http://capture-fixtures.capture-ledger:8080/charset/");
  assert.equal(marks.exchanges[0].ms, 452);
  assert.equal(marks.exchanges[0].status, 200);
  // 同じ URL を 2 度読んでも、別の対（sjis.css は 531 ms と 576 ms）
  const twice = marks.exchanges.filter((one) => one.uri.endsWith("/charset/sjis.css"));
  assert.deepEqual(twice.map((one) => one.ms), [531, 576]);
  // 写しの resource と、その説明の metadata は、要求の印にしない
  assert.equal(marks.notes.length, 0);
  assert.deepEqual(marks.snapshots, [
    {
      stage: "after-load",
      documentUrl: "http://capture-fixtures.capture-ledger:8080/charset/",
      uri: "urn:browserhive:snapshot:after-load:http://capture-fixtures.capture-ledger:8080/charset/",
      ms: 2784,
    },
  ]);
});

test("metadata だけの要求は「記録した時刻の印」。終わらなかった要求の時刻は、始まりではなく記録を止めた時刻（実物）", () => {
  const { originMs, endMs } = axisOf(fetchLate.answer);
  const marks = marksOf([{ path: WARC, records: fetchLate.records }], originMs);
  assert.equal(marks.exchanges.length, 1);
  assert.equal(marks.notes.length, 1);
  assert.equal(marks.notes[0].kind, "unread");
  // 頁は読み込みの 300 ms 後に要求を出したが、印は軸の終わり（記録を止めた時刻）に在る
  assert.equal(marks.notes[0].uri, "http://capture-fixtures.capture-ledger:8080/slow-response?delayMs=120000");
  assert.ok(marks.notes[0].ms > 3000, String(marks.notes[0].ms));
  assert.ok(endMs - marks.notes[0].ms < 100, `${String(marks.notes[0].ms)} / ${String(endMs)}`);
  const read = applyMetadata(marks, new Map(Object.entries(fetchLate.bodies)));
  assert.equal(read.notes[0].kind, "incomplete");
  assert.equal(read.notes[0].reason, "stop-while-pending");
  assert.equal(read.notes[0].resourceType, "Fetch");
  assert.deepEqual(tallyOf(read), { exchanges: 1, incomplete: 1, failed: 0, denied: 0, "not-archived": 0, unread: 0, unknown: 0 });
  assert.equal(tallyOf(read).incomplete, fetchLate.answer.capture.waczStats.totalIncomplete);
});

test("metadata の種類: 要求でない物・本文を省いた・失敗の 2 つ・方針の 2 つ・終わらなかった", () => {
  const kind = (text) => metadataKind(parseWarcFields(text));
  assert.equal(kind("window: not-opened\r\nurl: https://site.test/popup\r\n"), "window");
  assert.equal(kind("snapshot: after-load\r\ndocument-uri: https://site.test/\r\n"), "snapshot");
  assert.equal(kind("truncated: too-large\r\nencodedDataLength: 22020096\r\n"), "truncated");
  assert.equal(kind("incomplete: true\r\nreason: loadingFailed\r\nerrorText: net::ERR_FAILED\r\n"), "failed");
  assert.equal(kind("incomplete: true\r\nreason: loadingFinished-without-response\r\n"), "failed");
  assert.equal(kind("action: deny\r\npattern: *://ads.test/*\r\n"), "denied");
  assert.equal(kind("action: no-archive\r\npattern: *://t.test/*\r\n"), "not-archived");
  assert.equal(kind("incomplete: true\r\nreason: stop-while-pending\r\n"), "incomplete");
  assert.equal(kind("incomplete: true\r\nreason: stop-while-fetching-body\r\n"), "incomplete");
  assert.equal(kind("x: y\r\n"), "unknown");
  // 値の中の「:」は切らない。同じ名前は最初の値
  assert.deepEqual(parseWarcFields("document-uri: https://site.test/a:b\r\nreason: a\r\nreason: b\r\n"), {
    "document-uri": "https://site.test/a:b",
    reason: "a",
  });
});

/** 手で作った一覧: 対 → 本文を省いた対（metadata が続く）→ 開かせなかったウィンドウ → 失敗 → 止めた → 残さなかった。 */
const D = "2026-11-13T00:00:01.000Z";
const made = [
  { offset: 0, length: 10, type: "warcinfo", date: D },
  { offset: 10, length: 10, type: "response", uri: "https://site.test/", date: "2026-11-13T00:00:00.100Z", status: 200, mime: "text/html" },
  { offset: 20, length: 10, type: "request", uri: "https://site.test/", date: "2026-11-13T00:00:00.100Z" },
  { offset: 30, length: 10, type: "response", uri: "https://site.test/big.bin", date: "2026-11-13T00:00:00.200Z", status: 200, mime: "application/octet-stream" },
  { offset: 40, length: 10, type: "request", uri: "https://site.test/big.bin", date: "2026-11-13T00:00:00.200Z" },
  { offset: 50, length: 10, type: "metadata", uri: "https://site.test/big.bin", date: "2026-11-13T00:00:00.200Z" },
  { offset: 60, length: 10, type: "metadata", uri: "https://site.test/popup", date: "2026-11-13T00:00:00.300Z" },
  { offset: 70, length: 10, type: "metadata", uri: "https://site.test/gone.png", date: "2026-11-13T00:00:00.400Z" },
  { offset: 80, length: 10, type: "metadata", uri: "https://ads.test/a.js", date: "2026-11-13T00:00:00.500Z" },
  { offset: 90, length: 10, type: "metadata", uri: "https://t.test/px.gif", date: "2026-11-13T00:00:00.600Z" },
];
const madeBodies = new Map([
  [`${WARC} 50`, "truncated: too-large\r\nencodedDataLength: 22020096\r\n"],
  [`${WARC} 60`, "window: not-opened\r\n"],
  [`${WARC} 70`, "incomplete: true\r\nreason: loadingFailed\r\nerrorText: net::ERR_NAME_NOT_RESOLVED\r\nmethod: GET\r\nresourceType: Image\r\n"],
  [`${WARC} 80`, "action: deny\r\npattern: *://ads.test/*\r\nmethod: GET\r\nresourceType: Script\r\n"],
  [`${WARC} 90`, "action: no-archive\r\npattern: *://t.test/*\r\nmethod: GET\r\nresourceType: Image\r\n"],
]);

test("対の直後の metadata は「本文を省いた」理由になり、開かせなかったウィンドウは印にしない", () => {
  const marks = marksOf([{ path: WARC, records: made }], Date.parse("2026-11-13T00:00:00.000Z"));
  assert.equal(marks.exchanges.length, 2);
  assert.deepEqual(marks.exchanges[1].attached, { path: WARC, offset: 50, length: 10 });
  assert.equal(bodyKey(marks.exchanges[1].attached), `${WARC} 50`);
  // 本文を読む前: 対に付かない metadata は 4 つとも「読んでいない」
  assert.equal(tallyOf(marks).unread, 4);
  const read = applyMetadata(marks, madeBodies);
  assert.equal(read.exchanges[1].bodyOmitted, "too-large");
  assert.equal(read.exchanges[0].bodyOmitted, undefined);
  assert.deepEqual(
    read.notes.map((note) => [note.kind, note.ms, note.uri]),
    [
      ["failed", 400, "https://site.test/gone.png"],
      ["denied", 500, "https://ads.test/a.js"],
      ["not-archived", 600, "https://t.test/px.gif"],
    ],
  );
  assert.equal(read.notes[0].error, "net::ERR_NAME_NOT_RESOLVED");
  assert.equal(read.notes[1].pattern, "*://ads.test/*");
  // 数の突き合わせの式: 対 = 記録した数 + 本文を省いた数、失敗・止めた・残さなかったは別々
  assert.deepEqual(tallyOf(read), { exchanges: 2, incomplete: 0, failed: 1, denied: 1, "not-archived": 1, unread: 0, unknown: 0 });
});

test("本文をまだ読んでいない metadata は「読んでいない」のまま残る", () => {
  const marks = marksOf([{ path: WARC, records: made }], 0);
  const some = new Map([[`${WARC} 70`, madeBodies.get(`${WARC} 70`)]]);
  assert.deepEqual(tallyOf(applyMetadata(marks, some)), {
    exchanges: 2,
    incomplete: 0,
    failed: 1,
    denied: 0,
    "not-archived": 0,
    unread: 3,
    unknown: 0,
  });
});

/** 一覧を返す偽物。`answers` は path → 答えの並び（1 回ごと）。呼ばれた path を残す。 */
const fakeFetch = (answers) => {
  const calls = [];
  const fetchJson = (path) => {
    calls.push(path);
    const next = answers(path, calls.length);
    return Promise.resolve(next);
  };
  return { fetchJson, calls };
};
const NO_ENTRY = { status: 400, body: { code: "badRequest", message: "no entry: archive/data-001.warc.gz" } };

test("WARC の本を data-000 から順に読み、「その名前の entry は無い」で終わる", async () => {
  const { fetchJson, calls } = fakeFetch((path) =>
    path.includes("data-000") ? { status: 200, body: { records: charset.records, next: null, total: 25 } } : NO_ENTRY,
  );
  const read = await readRecords(fetchJson, "a1");
  assert.equal(read.error, undefined);
  assert.deepEqual(read.files.map((file) => [file.path, file.records.length]), [[WARC, 25]]);
  assert.deepEqual(calls, [recordsPath("a1", WARC, 0), recordsPath("a1", warcName(1), 0)]);
});

test("1,000 本を超える本は、答えの next で続きを読む", async () => {
  const page = (n) => Array.from({ length: n }, (_, i) => ({ offset: i, length: 1, type: "request" }));
  const { fetchJson, calls } = fakeFetch((path) => {
    if (!path.includes("data-000")) return NO_ENTRY;
    return path.includes("from=0&") ? { status: 200, body: { records: page(1000), next: 1000 } } : { status: 200, body: { records: page(7), next: null } };
  });
  const read = await readRecords(fetchJson, "a1");
  assert.equal(read.files[0].records.length, 1007);
  assert.deepEqual(calls.slice(0, 2), [recordsPath("a1", WARC, 0), recordsPath("a1", WARC, 1000)]);
});

test("「entry は無い」でない 400 は終わりの合図にせず、理由として返す", async () => {
  assert.equal(isNoEntry(400, { message: "no entry: archive/data-001.warc.gz" }), true);
  assert.equal(isNoEntry(400, { message: "could not open the source" }), false);
  assert.equal(isNoEntry(404, { message: "no entry: x" }), false);
  const { fetchJson, calls } = fakeFetch(() => ({ status: 400, body: { code: "badRequest", message: "could not open the source" } }));
  const read = await readRecords(fetchJson, "a1");
  assert.deepEqual(read, { files: [], error: { status: 400, message: "could not open the source" } });
  assert.equal(calls.length, 1);
  // 見てよくない WACZ（capture-ledger の 404）も理由
  const denied = await readRecords(fakeFetch(() => ({ status: 404, body: { error: "not found" } })).fetchJson, "a1");
  assert.deepEqual(denied.error, { status: 404, message: "not found" });
});

test("軸の上の位置と目盛り", () => {
  assert.equal(percentOf(452, 3100), (452 / 3100) * 100);
  assert.equal(percentOf(-5, 3100), 0);
  assert.equal(percentOf(4000, 3100), 100);
  assert.equal(percentOf(undefined, 3100), 0);
  assert.deepEqual(ticksOf(3100), [0, 500, 1000, 1500, 2000, 2500, 3000]);
  assert.deepEqual(ticksOf(30348), [0, 5000, 10000, 15000, 20000, 25000, 30000]);
});
