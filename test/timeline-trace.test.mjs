/**
 * 「経緯」の画面の計算のうち、答えの `trace`（BrowserHive v30.0.0 から）の行を読む所（`public/timeline.js`）。
 *
 * 見本（`timeline-trace-sample.json`）は、dev の capture-fixtures を BrowserHive v30.0.0 で撮った実物の答え 4 本
 * （遅い fetch・終わらない fetch・リダイレクト 3 回・読み込みの時間切れ）と、BrowserHive の e2e で本物の Chromium が
 * 出した行 2 本（別サイトのフレームの文書・名前の引けないフレームの文書）。期待値は、その実物から数えた物。
 * 実物に無い形（方針に当たった行・追うのをやめた行・上限で捨てた行・壁時計のずれた行）は、実物の行を手で直して作る。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import v29 from "./timeline-sample.json" with { type: "json" };
import sample from "./timeline-trace-sample.json" with { type: "json" };
import { setLang } from "../public/i18n.js";
import {
  REQUEST_KINDS,
  REQUEST_SORTS,
  TIMING_PARTS,
  axisOf,
  filterRequests,
  hasTrace,
  isTroubledRequest,
  lengthText,
  readsRecords,
  requestCountsOf,
  requestKindOf,
  requestKindText,
  requestsOf,
  snapshotsFromLog,
  sortRequests,
  stepsOf,
  timingOf,
} from "../public/timeline.js";

const { fetch, hang, redirect, timeout, e2eLines } = sample;

/** 実物の行を 1 本、欄を替えて作る。 */
const lineLike = (over) => ({ ...fetch.trace.lines[2], ...over });

/** 行だけを持つ trace。数は行から数える（捨てた行は無い）。 */
const traceOf = (lines, over = {}) => {
  const counts = { finished: 0, redirected: 0, failed: 0, pending: 0, notArchived: 0, denied: 0, evicted: 0 };
  for (const line of lines) counts[line.outcome === "not-archived" ? "notArchived" : line.outcome] += 1;
  return { lines, counts, dropped: 0, ...over };
};

test("trace を持つ答えでは、WACZ のレコードを読みに行かない。持たない答え（v30.0.0 より前）は読む", () => {
  // 実物: 撮れた取り込みで、WACZ も trace も在る
  assert.equal(hasTrace(fetch), true);
  assert.equal(typeof fetch.archive.id, "string");
  assert.equal(readsRecords(fetch), false);
  // 対照: 第 1 部の見本（BrowserHive v29.1.0 の答え。trace は null）
  assert.equal(hasTrace(v29.charset.answer), false);
  assert.equal(readsRecords(v29.charset.answer), true);
  // trace が null・行の配列でない物は、持たない扱い
  assert.equal(hasTrace({ ...fetch, trace: null }), false);
  assert.equal(hasTrace({ ...fetch, trace: { counts: {} } }), false);
  assert.equal(readsRecords({ ...fetch, trace: null }), true);
});

test("遅い fetch の行は、始まりから長さぶんの棒。長さは capture-fixtures が待たせた時間以上", () => {
  const { endMs } = axisOf(fetch);
  const requests = requestsOf(fetch.trace, endMs);
  assert.equal(requests.length, 3);
  const slow = requests.find((one) => one.line.url.endsWith("/slow-response?delayMs=1537"));
  assert.equal(slow.kind, "finished");
  assert.equal(slow.shape, "bar");
  assert.equal(slow.fromMs, slow.line.ms);
  assert.equal(slow.toMs - slow.fromMs, slow.line.durationMs);
  assert.ok(slow.toMs - slow.fromMs >= 1537 && slow.toMs - slow.fromMs < 3000, String(slow.toMs - slow.fromMs));
  // 軸の内に収まる（始まりも終わりも、取り込みの長さの中）
  assert.ok(slow.fromMs > 0 && slow.toMs <= endMs);
  // 行の番号は、trace の行の並びのまま
  assert.deepEqual(requests.map((one) => one.index), [0, 1, 2]);
});

test("棒の始まりは行の ms（ログと同じ軸）。Chromium の壁時計（startedAt）がずれていても、取り込みの段の帯とずれない", () => {
  const { endMs } = axisOf(fetch);
  // 実物の行の壁時計を 400 ms 進めた見本。ms は実物のまま
  const skewed = fetch.trace.lines.map((line) => ({
    ...line,
    startedAt: new Date(Date.parse(line.startedAt) + 400).toISOString(),
  }));
  const moved = requestsOf(traceOf(skewed), endMs);
  const real = requestsOf(fetch.trace, endMs);
  assert.deepEqual(moved.map((one) => [one.fromMs, one.toMs]), real.map((one) => [one.fromMs, one.toMs]));
  // 主文書の要求は、読み込みの段（load-pages）の帯の中で始まる
  const load = stepsOf(fetch.log.lines, endMs).find((step) => step.step === "load-pages");
  assert.ok(moved[0].fromMs >= load.fromMs && moved[0].fromMs < load.toMs, `${String(moved[0].fromMs)} が ${String(load.fromMs)}〜${String(load.toMs)} の外`);
});

test("内訳の和と残りを足すと、長さになる。残りは負にならない", () => {
  const slow = fetch.trace.lines[2];
  const timing = timingOf(slow);
  assert.deepEqual(timing.parts.map((part) => part.key), TIMING_PARTS);
  assert.equal(timing.sumMs, timing.parts.reduce((sum, part) => sum + part.ms, 0));
  assert.equal(timing.sumMs + timing.otherMs, slow.durationMs);
  assert.ok(timing.parts.find((part) => part.key === "waitMs").ms >= 1537);
  // 内訳の和が長さを超える行（丸めの都合）でも、残りは 0 で止める
  assert.equal(timingOf(lineLike({ durationMs: 5, timing: { ...slow.timing, waitMs: 9 } })).otherMs, 0);
  // 内訳か長さの無い行（終わらなかった・方針に当たった）は、内訳を持たない
  assert.equal(timingOf(hang.trace.lines[1]), undefined);
  assert.equal(timingOf(lineLike({ timing: undefined })), undefined);
  assert.equal(timingOf(lineLike({ durationMs: undefined })), undefined);
});

test("終わらなかった行は、始まりから軸の終わりまでの開いた棒。長さは持たない", () => {
  const { endMs } = axisOf(hang);
  const requests = requestsOf(hang.trace, endMs);
  const pending = requests.find((one) => one.line.outcome === "pending");
  assert.equal(pending.kind, "pending");
  assert.equal(pending.shape, "open");
  assert.equal(pending.toMs, endMs);
  assert.equal("durationMs" in pending.line, false);
  // 時間切れの取り込み（WACZ は無い）でも、行は在り、文書の要求が開いた棒になる
  assert.equal(timeout.archive, null);
  const stopped = requestsOf(timeout.trace, axisOf(timeout).endMs);
  assert.deepEqual(stopped.map((one) => [one.kind, one.shape]), [["pending", "open"]]);
  assert.equal(stopped[0].toMs, axisOf(timeout).endMs);
});

test("方針に当たった行・追うのをやめた行は、始まりの印だけ。長さを描かない", () => {
  const bare = (outcome) => {
    const { initiator: _i, response: _r, timing: _t, durationMs: _d, encodedBytes: _e, record: _c, ...rest } = fetch.trace.lines[2];
    return { ...rest, outcome };
  };
  const requests = requestsOf(traceOf([bare("not-archived"), bare("denied"), bare("evicted")]), 4000);
  assert.deepEqual(requests.map((one) => [one.kind, one.shape, one.toMs - one.fromMs]), [
    ["not-archived", "mark", 0],
    ["denied", "mark", 0],
    ["evicted", "mark", 0],
  ]);
});

test("終わりを観測できない行は、終わらなかった行と別の種類。印だけで、終わらなかった数に入れない", () => {
  // 実物: 別サイトのフレームの文書（応答の見出しまでは届き、終わりは届かない）
  const frame = e2eLines.unobservable;
  assert.equal(frame.outcome, "pending");
  assert.equal(frame.endUnobservable, true);
  assert.equal(requestKindOf(frame), "unobservable");
  // 対照: 本当に終わらなかった行
  const never = hang.trace.lines[1];
  assert.equal(requestKindOf(never), "pending");
  const trace = traceOf([frame, never, e2eLines.failed]);
  const requests = requestsOf(trace, 4000);
  assert.deepEqual(requests.map((one) => [one.kind, one.shape]), [
    ["unobservable", "mark"],
    ["pending", "open"],
    ["failed", "bar"],
  ]);
  // 数: trace の counts は 2 つとも pending に数えている。画面は、観測できない分を引いて別に出す
  assert.equal(trace.counts.pending, 2);
  const counts = requestCountsOf(trace);
  assert.equal(counts.pending, 1);
  assert.equal(counts.unobservable, 1);
  assert.equal(counts.failed, 1);
  assert.equal(counts.total, 3);
  // 絞り込み「失敗と終わらなかった物だけ」にも入れない
  assert.deepEqual(requests.map(isTroubledRequest), [false, true, true]);
  assert.deepEqual(filterRequests(requests, "trouble").map((one) => one.kind), ["pending", "failed"]);
  assert.equal(filterRequests(requests, "all").length, 3);
});

test("名前の引けないフレームの文書の行は、失敗。Chromium の文と長さを持つ", () => {
  const [one] = requestsOf(traceOf([e2eLines.failed]), 4000);
  assert.equal(one.kind, "failed");
  assert.equal(one.shape, "bar");
  assert.equal(one.line.error, "net::ERR_NAME_NOT_RESOLVED");
});

test("結末ごとの数は trace の counts から。上限で捨てた行も数に入っている", () => {
  // 実物: 捨てた行は無く、数は行と同じ
  assert.deepEqual(requestCountsOf(redirect.trace), {
    finished: 1, redirected: 3, failed: 0, pending: 0, unobservable: 0, "not-archived": 0, denied: 0, evicted: 0, total: 4, dropped: 0,
  });
  // 上限で 1,200 本を捨てた取り込み: 行は 2 本だけ残り、数は捨てた分も言う
  const cut = {
    lines: fetch.trace.lines.slice(0, 2),
    counts: { finished: 1190, redirected: 2, failed: 3, pending: 4, notArchived: 1, denied: 1, evicted: 1 },
    dropped: 1200,
  };
  const counts = requestCountsOf(cut);
  assert.equal(counts.total, 1202);
  assert.equal(counts.dropped, 1200);
  assert.equal(counts["not-archived"], 1);
  // counts の無い trace でも投げない
  assert.equal(requestCountsOf({ lines: [] }).total, 0);
});

test("リダイレクトは段ごとに 1 行。同じ id で、hop が 0 から増える", () => {
  const requests = requestsOf(redirect.trace, axisOf(redirect).endMs);
  assert.deepEqual(requests.map((one) => [one.kind, one.line.hop, one.line.response.status]), [
    ["redirected", 0, 302],
    ["redirected", 1, 302],
    ["redirected", 2, 302],
    ["finished", 3, 200],
  ]);
  assert.equal(new Set(requests.map((one) => one.line.id)).size, 1);
});

test("並べ方: 始まりの順と、長い順（長さを持たない行は後ろ）", () => {
  assert.deepEqual(REQUEST_SORTS, ["start", "longest"]);
  const requests = requestsOf(traceOf([...fetch.trace.lines, hang.trace.lines[1]]), 4000);
  const urlOf = (one) => new URL(one.line.url).pathname;
  assert.deepEqual(sortRequests(requests, "start").map((one) => one.fromMs), [...requests.map((one) => one.fromMs)].sort((a, b) => a - b));
  assert.deepEqual(sortRequests(requests, "longest").map(urlOf), ["/slow-response", "/fetch-late", "/favicon.ico", "/slow-response"]);
  assert.equal(sortRequests(requests, "longest").at(-1).shape, "open");
  // 元の並びは変えない
  assert.deepEqual(requests.map((one) => one.index), [0, 1, 2, 3]);
});

test("写しの印は、ログの細部の行の位置に置く。URN の文書の URL は、答えの document.url（ページの行の URL ではない）", () => {
  // 実物: リダイレクトした取り込み。ページの行の URL と、撮った文書の URL が違う
  assert.equal(redirect.page.url.endsWith("/server-redirect-chain/2"), true);
  assert.equal(redirect.capture.document.url.endsWith("/redirect-target"), true);
  const line = redirect.log.lines.find((one) => one.msg.startsWith("snapshot after-load"));
  assert.deepEqual(snapshotsFromLog(redirect.log.lines, redirect.capture), [
    {
      stage: "after-load",
      ms: line.ms,
      dpr: 1,
      documentUrl: redirect.capture.document.url,
      uri: `urn:browserhive:snapshot:after-load:${redirect.capture.document.url}`,
    },
  ]);
  // 文書の URL の無い答え（方針で伏せた文書）では、印だけ
  assert.deepEqual(snapshotsFromLog(redirect.log.lines, { document: { withheld: "no-archive" } }), [{ stage: "after-load", ms: line.ms, dpr: 1 }]);
  // 写しを取る前に止まった取り込み（時間切れ）には、印が無い
  assert.deepEqual(snapshotsFromLog(timeout.log.lines, timeout.capture), []);
  // 取り込みのページの console が同じ字を書いても、印にしない
  assert.deepEqual(snapshotsFromLog([{ source: "page", level: "debug", ms: 5, msg: "snapshot after-load" }], redirect.capture), []);
});

test("長さの字は、1 秒未満が ms、それより上が秒", () => {
  assert.equal(lengthText(23), "23 ms");
  assert.equal(lengthText(999.6), "1000 ms");
  assert.equal(lengthText(1551), "1.55 秒");
  assert.equal(lengthText(undefined), "—");
  setLang("en");
  try {
    assert.equal(lengthText(1551), "1.55 s");
  } finally {
    setLang("ja");
  }
});

test("行の種類の字は、どの種類にも 2 つの言語で在る。知らない結末は届いた字のまま", () => {
  const ja = REQUEST_KINDS.map(requestKindText);
  assert.equal(new Set(ja).size, REQUEST_KINDS.length);
  assert.equal(requestKindText("unobservable"), "終わりを観測できない");
  assert.equal(requestKindText("pending"), "終わらなかった");
  setLang("en");
  try {
    const en = REQUEST_KINDS.map(requestKindText);
    assert.equal(new Set(en).size, REQUEST_KINDS.length);
    for (const text of en) assert.equal(/[ぁ-ん一-龥]/.test(text), false, text);
  } finally {
    setLang("ja");
  }
  assert.equal(requestKindText("half-done"), "half-done");
  assert.equal(requestKindOf({ outcome: "half-done" }), "half-done");
});
