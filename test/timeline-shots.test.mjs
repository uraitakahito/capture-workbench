/**
 * 「経緯」の画面の計算のうち、節目のスクリーンショットと失敗の時点の絵を読む所（`public/timeline.js`）。
 *
 * 見本は、代役の筋書き（`sandbox/scenario.json`）のクロール 5b0c000b のページ 1304〜1307 の答えと、置き場の WACZ
 * （BrowserHive v30.2.0 の e2e が作った実物。出どころは `sandbox/samples/SOURCE.md`）。絵の位置は、その WACZ の本物の
 * 索引から引き、引いた先のレコードが絵であることまで確かめる。実物に無い形（理由が時点ごとに違う・窓が切った長い行・
 * 窓より長い索引・WebP でない行）は、実物の項目と行を手で直して作る。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { setLang } from "../public/i18n.js";
import {
  INDEX_COUNT,
  INDEX_WINDOWS_MAX,
  SCREENSHOT_SKIPS,
  SCREENSHOT_STAGES,
  axisOf,
  base64Bytes,
  cdxjTimestamp,
  failureScreenshotOf,
  failureScreenshotPath,
  failureScreenshotSrc,
  hasFailureScreenshot,
  indexLinePath,
  indexLinesPath,
  locateScreenshots,
  readsScreenshots,
  screenshotIndexKey,
  screenshotPlaceOf,
  screenshotSkipLines,
  screenshotSkipText,
  screenshotSrc,
  screenshotsOf,
} from "../public/timeline.js";
import { idOf, pageFailureScreenshot, pageTrace } from "../sandbox/fake-ledger.mjs";
import { paramsFor, parseWaczRoute } from "../src/wacz.mjs";
import { warcRecord, zipEntry } from "./wacz-entry.mjs";

const scenario = JSON.parse(readFileSync(new URL("../sandbox/scenario.json", import.meta.url), "utf8"));
const crawl = scenario.crawls.find((c) => c.crawlId.startsWith("5b0c000b"));
const SAMPLES = ["trace-timeline.wacz", "with-screenshots.wacz", "without-screenshots-withheld.wacz", "without-screenshots-secret.wacz"];
const answerOf = (pageId) => pageTrace(crawl, pageId, SAMPLES).body;

/** 絵が 2 枚在る取り込み・絵を残さなかった取り込み 2 つ・文書が 503 を返した取り込み・欄の無い取り込み（v30.0.0）。 */
const withShots = answerOf("1304");
const withheld = answerOf("1305");
const secret = answerOf("1306");
const failed = answerOf("1307");
const before = answerOf("1301");

const WACZ = readFileSync(new URL("../sandbox/samples/with-screenshots.wacz", import.meta.url));
const ARCHIVE_ID = idOf("with-screenshots.wacz");
const INDEX_LINES = zipEntry(WACZ, "indexes/index.cdxj").toString("utf8").split("\n").filter((line) => line !== "");

/** daemon の行の窓（`POST /lines`）の答えの形。1 行は 2 KiB で切る。 */
const LINE_CAP = 2 * 1024;
const windowOf = (lines, from, count) => ({
  status: 200,
  body: {
    lines: lines.slice(from, from + count).map((text, i) => ({
      n: from + i,
      text: text.slice(0, LINE_CAP),
      cut: text.length > LINE_CAP,
      bytes: Buffer.byteLength(text),
      binary: false,
    })),
    next: from + count < lines.length ? from + count : null,
    gunzipped: false,
  },
});

/** 偽の読み手。索引の行（`lines`）を daemon と同じ窓で返し、呼ばれた path を覚える。 */
const fakeIndex = (lines) => {
  const calls = [];
  const fetchJson = async (path) => {
    calls.push(path);
    const route = parseWaczRoute(path);
    // 画面が組んだ path は、workbench のサーバの検査（`src/wacz.mjs`）を通る形でなければならない
    const params = paramsFor(route.op, route.params);
    if (route.op === "lines") return windowOf(lines, params.from, Math.min(params.count, 500));
    if (route.op === "line") return { status: 200, body: { n: params.n, text: lines[params.n], cut: false, binary: false, fields: [], gunzipped: false } };
    throw new Error(`思いがけない読み: ${path}`);
  };
  return { fetchJson, calls };
};

/** 実物の絵の項目（after-load）と、その索引の行。 */
const realShot = screenshotsOf(withShots)[0];
const realLine = INDEX_LINES.find((line) => line.startsWith(realShot.url));

test("絵の項目は時点の順に並ぶ（after-load が先）。知らない時点は後ろで、同じ時点は届いた順", () => {
  assert.deepEqual(SCREENSHOT_STAGES, ["after-load", "after-behaviors"]);
  // 実物: 2 枚。時点ごとに文書の URL が違う（スクリプトが検索の結果へ進めた）
  const shots = screenshotsOf(withShots);
  assert.deepEqual(shots.map((shot) => [shot.stage, shot.kept, shot.bytes]), [["after-load", true, 5624], ["after-behaviors", true, 6656]]);
  assert.ok(shots[0].documentUrl.endsWith("/marked/search/public?tag=ss-bc7949de"));
  assert.ok(shots[1].documentUrl.endsWith("/marked/search/public/result?tag=ss-bc7949de"));
  // 届いた並びが逆でも、時点の順に直す。項目と時点の組は崩れない（URI・時刻・大きさは、その時点の物のまま）
  const reversed = { ...withShots, capture: { ...withShots.capture, screenshots: [...withShots.capture.screenshots].reverse() } };
  assert.deepEqual(screenshotsOf(reversed), shots);
  for (const shot of shots) assert.ok(shot.url.startsWith(`urn:browserhive:screenshot:${shot.stage}:`), shot.url);
  // 知らない時点は後ろ。時点の無い項目・object でない項目は捨てる
  const odd = {
    ...withShots,
    capture: {
      ...withShots.capture,
      screenshots: [{ stage: "after-idle", skipped: "failed" }, null, { skipped: "failed" }, ...withShots.capture.screenshots],
    },
  };
  assert.deepEqual(screenshotsOf(odd).map((shot) => shot.stage), ["after-load", "after-behaviors", "after-idle"]);
});

test("絵の位置は、撮り始めた時刻（date）から軸の 0 を引いた所。同じ時点の写しの URI は、絵の URI の文書の URL から組む", () => {
  const { originMs, endMs } = axisOf(withShots);
  const shots = screenshotsOf(withShots);
  for (const shot of shots) {
    assert.equal(shot.ms, Date.parse(shot.date) - originMs);
    assert.ok(shot.ms > 0 && shot.ms < endMs, `${String(shot.ms)} が軸の外`);
    assert.equal(shot.snapshotUri, `urn:browserhive:snapshot:${shot.stage}:${shot.documentUrl}`);
  }
  // 読み込みの後の絵が先、スクリプトの後の絵が後
  assert.ok(shots[0].ms < shots[1].ms);
  // 答えの document.url は最後の文書の URL で、after-load の時点の文書の URL とは違う（写しの URI は時点ごとに組む）
  assert.equal(withShots.capture.document.url, shots[1].documentUrl);
  assert.notEqual(withShots.capture.document.url, shots[0].documentUrl);
  // 絵の URI が決まった形でなければ、文書の URL も写しの URI も組まない
  const strange = { ...withShots, capture: { ...withShots.capture, screenshots: [{ ...withShots.capture.screenshots[0], url: "urn:other:1" }] } };
  assert.deepEqual([screenshotsOf(strange)[0].documentUrl, screenshotsOf(strange)[0].snapshotUri], [undefined, undefined]);
});

test("欄の無い取り込み（BrowserHive v30.1.0 以前）では、何も足さない", () => {
  assert.equal("screenshots" in before.capture, false);
  assert.equal(screenshotsOf(before), undefined);
  assert.equal(readsScreenshots(before), false);
  assert.equal(hasFailureScreenshot(before), false);
  assert.deepEqual(screenshotSkipLines(screenshotsOf(before)), []);
  // 取り込みの答えの無いページ（capture が null）でも同じ
  assert.equal(screenshotsOf({ ...before, capture: null }), undefined);
  assert.equal(readsScreenshots({ ...before, capture: null }), false);
});

test("絵が無い取り込み（欄が無い・全部が「残さなかった」・WACZ が無い）では、WACZ への往復が 0", async () => {
  // 実物: 理由つきで残さなかった取り込み 2 つは、WACZ を持つ。それでも読みに行かない
  assert.equal(typeof withheld.archive.id, "string");
  assert.equal(typeof secret.archive.id, "string");
  for (const answer of [before, withheld, secret, failed]) {
    assert.equal(readsScreenshots(answer), false);
    const { fetchJson, calls } = fakeIndex(INDEX_LINES);
    const read = await locateScreenshots(fetchJson, answer.archive?.id, screenshotsOf(answer));
    assert.deepEqual([calls.length, read.places.size, read.error], [0, 0, undefined]);
  }
  // 絵の項目が在っても、WACZ の無い答えと、見てよくない WACZ（capture-ledger が鍵を返さない）では行かない
  assert.equal(readsScreenshots({ ...withShots, archive: null }), false);
  assert.equal(readsScreenshots({ ...withShots, archive: { id: withShots.archive.id, objectKey: null } }), false);
  // 対照: 絵の項目が 1 つでも在れば行く
  assert.equal(readsScreenshots(withShots), true);
  const mixed = { ...withShots, capture: { ...withShots.capture, screenshots: [withShots.capture.screenshots[0], { stage: "after-behaviors", skipped: "failed" }] } };
  assert.equal(readsScreenshots(mixed), true);
});

test("絵が在る取り込みの往復は、索引の窓 1 つ。引いた位置のレコードは、その時点の絵（実物の WACZ）", async () => {
  const shots = screenshotsOf(withShots);
  const { fetchJson, calls } = fakeIndex(INDEX_LINES);
  const read = await locateScreenshots(fetchJson, ARCHIVE_ID, shots);
  assert.deepEqual(calls, [indexLinesPath(ARCHIVE_ID, 0)]);
  assert.equal(read.error, undefined);
  // 索引は鍵の順（after-behaviors の行が先）。引いた結果は、絵の URI で引く
  assert.deepEqual([...read.places.keys()].sort(), shots.map((shot) => shot.url).sort());
  const warc = zipEntry(WACZ, "archive/data-000.warc.gz");
  for (const shot of shots) {
    const place = read.places.get(shot.url);
    assert.equal(place.path, "archive/data-000.warc.gz");
    // 位置の先に在るのは、その時点の絵のレコード（時点を取り違えると、URI と時刻と大きさが合わない）
    const { headers, body } = warcRecord(warc, place.offset, place.length);
    assert.equal(headers.get("warc-type"), "resource");
    assert.equal(headers.get("warc-target-uri"), shot.url);
    assert.equal(headers.get("warc-date"), shot.date);
    assert.equal(headers.get("warc-record-id"), `<${shot.record}>`);
    assert.equal(headers.get("content-type"), "image/webp");
    assert.equal(body.length, shot.bytes);
    assert.equal(`${body.subarray(0, 4).toString("latin1")} ${body.subarray(8, 12).toString("latin1")}`, "RIFF WEBP");
  }
});

test("同じ秒に撮った 2 枚でも、時点を取り違えない（索引の行は、絵の URI と時刻の両方で引く）", async () => {
  // 実物の 2 枚は別の秒（…33 と …34）。スクリプトの後の絵を、読み込みの後の絵と同じ秒に撮った形に直す
  const [load, behaviors] = screenshotsOf(withShots);
  const sameSecond = { ...behaviors, date: "2026-11-13T16:36:33.990Z" };
  assert.equal(cdxjTimestamp(sameSecond.date), cdxjTimestamp(load.date));
  const lines = INDEX_LINES.map((line) => (line.startsWith(behaviors.url) ? line.replace(" 20261113163634 ", " 20261113163633 ") : line));
  // 索引は鍵の順なので、after-behaviors の行が先に来る
  assert.ok(lines.findIndex((line) => line.startsWith(behaviors.url)) < lines.findIndex((line) => line.startsWith(load.url)));
  const { fetchJson } = fakeIndex(lines);
  const read = await locateScreenshots(fetchJson, ARCHIVE_ID, [load, sameSecond]);
  assert.deepEqual(read.places.get(load.url), { path: "archive/data-000.warc.gz", offset: 6576, length: 4232 });
  assert.deepEqual(read.places.get(sameSecond.url), { path: "archive/data-000.warc.gz", offset: 11273, length: 5275 });
  // 別の時点の絵の行は、同じ秒でも、この絵の位置にしない
  assert.equal(screenshotPlaceOf(lines.find((line) => line.startsWith(behaviors.url)), load), undefined);
});

test("絵の <img> に渡す URL は、同じオリジンの /wacz/<archive の id>/record/body。workbench のサーバの検査を通る", () => {
  const place = screenshotPlaceOf(realLine, realShot);
  assert.deepEqual(place, { path: "archive/data-000.warc.gz", offset: 6576, length: 4232 });
  const src = screenshotSrc(ARCHIVE_ID, place);
  assert.equal(src, `/wacz/${ARCHIVE_ID}/record/body?path=archive%2Fdata-000.warc.gz&offset=6576&length=4232`);
  const route = parseWaczRoute(src);
  assert.deepEqual([route.archiveId, route.op], [ARCHIVE_ID, "record/body"]);
  assert.deepEqual(paramsFor(route.op, route.params), place);
  // id と path に URL の記号が在っても、1 つの値のまま運ぶ
  const odd = screenshotSrc("a/b?c", { path: "archive/data 001&x=1.warc.gz", offset: 0, length: 1 });
  assert.equal(odd.startsWith("/wacz/a%2Fb%3Fc/record/body?"), true);
  assert.equal(new URLSearchParams(odd.split("?")[1]).get("path"), "archive/data 001&x=1.warc.gz");
});

test("索引の行の鍵は、絵の URI と 14 桁の時刻。WebP でない行・時刻の違う行・位置の揃わない行は、絵の位置にしない", () => {
  assert.equal(cdxjTimestamp("2026-11-13T16:36:33.845Z"), "20261113163633");
  assert.equal(cdxjTimestamp("いつか"), undefined);
  assert.equal(screenshotIndexKey(realShot), `${realShot.url} 20261113163633 `);
  assert.equal(realLine.startsWith(screenshotIndexKey(realShot)), true);
  const fields = JSON.parse(realLine.slice(screenshotIndexKey(realShot).length));
  // 実物の行: status は無く、mime は image/webp
  assert.deepEqual(["status" in fields, fields.mime], [false, "image/webp"]);
  const lineWith = (over) => `${screenshotIndexKey(realShot)}${JSON.stringify({ ...fields, ...over })}`;
  assert.deepEqual(screenshotPlaceOf(lineWith({}), realShot), { path: "archive/data-000.warc.gz", offset: 6576, length: 4232 });
  // WebP でない物（SVG・HTML）を <img> に渡さない
  assert.equal(screenshotPlaceOf(lineWith({ mime: "image/svg+xml" }), realShot), undefined);
  assert.equal(screenshotPlaceOf(lineWith({ mime: "text/html" }), realShot), undefined);
  // 位置が揃わない
  assert.equal(screenshotPlaceOf(lineWith({ offset: "x" }), realShot), undefined);
  assert.equal(screenshotPlaceOf(lineWith({ length: "0" }), realShot), undefined);
  assert.equal(screenshotPlaceOf(lineWith({ filename: "../data-000.warc.gz" }), realShot), undefined);
  assert.equal(screenshotPlaceOf(lineWith({ filename: undefined }), realShot), undefined);
  // 同じ URI でも、別の秒に撮った絵の行ではない
  assert.equal(screenshotPlaceOf(realLine, { ...realShot, date: "2026-11-13T16:36:35.000Z" }), undefined);
  // 別の時点の絵の行・写しの行・JSON でない行
  const other = screenshotsOf(withShots)[1];
  assert.equal(screenshotPlaceOf(INDEX_LINES.find((line) => line.startsWith(other.url)), realShot), undefined);
  assert.equal(screenshotPlaceOf(INDEX_LINES.find((line) => line.startsWith("urn:browserhive:snapshot:after-load:")), realShot), undefined);
  assert.equal(screenshotPlaceOf(`${screenshotIndexKey(realShot)}{"url":`, realShot), undefined);
  assert.equal(screenshotPlaceOf(undefined, realShot), undefined);
});

test("窓より長い索引は、絵が全部見つかるまで次の窓を読み、見つかったら止める", async () => {
  const shots = screenshotsOf(withShots);
  const filler = (n) => Array.from({ length: n }, (_, i) => `test,site)/${String(i).padStart(5, "0")} 20261113163633 {"url":"https://site.test/${String(i)}","mime":"text/html","status":"200","length":"10","offset":"${String(i)}","filename":"data-000.warc.gz"}`);
  // 絵の行は 2 つ目の窓に在る。3 つ目の窓は読まない
  const long = [...filler(INDEX_COUNT + 10), ...INDEX_LINES, ...filler(INDEX_COUNT * 2)];
  const { fetchJson, calls } = fakeIndex(long);
  const read = await locateScreenshots(fetchJson, ARCHIVE_ID, shots);
  assert.deepEqual(calls, [indexLinesPath(ARCHIVE_ID, 0), indexLinesPath(ARCHIVE_ID, INDEX_COUNT)]);
  assert.equal(read.places.size, 2);
  // 索引に絵の行が無ければ、終わりまで読んで「見つからない」（誤りではない）
  const none = fakeIndex(filler(INDEX_COUNT + 10));
  const missing = await locateScreenshots(none.fetchJson, ARCHIVE_ID, shots);
  assert.deepEqual([none.calls.length, missing.places.size, missing.error], [2, 0, undefined]);
  // 上限まで読んでも見つからなければ、理由を返す（字は、読んだときの言語）
  const endless = fakeIndex(filler(INDEX_COUNT * (INDEX_WINDOWS_MAX + 1)));
  const gaveUp = await locateScreenshots(endless.fetchJson, ARCHIVE_ID, shots);
  assert.equal(endless.calls.length, INDEX_WINDOWS_MAX);
  assert.deepEqual(gaveUp.error, { status: 0, message: "WACZ の索引が 10,000 行を超えたので、残りは読んでいません" });
});

test("窓が切った長い行（文書の URL が長い）は、その 1 行だけ丸ごと読む。ほかの切られた行は読まない", async () => {
  // 実物の絵の項目の文書の URL に、長い query を足した見本。行は窓の上限（2 KiB）を超える
  const tail = `&q=${"x".repeat(1500)}`;
  const longShot = { ...realShot, url: `${realShot.url}${tail}` };
  const fields = JSON.parse(realLine.slice(screenshotIndexKey(realShot).length));
  const longLine = `${screenshotIndexKey(longShot)}${JSON.stringify({ ...fields, url: longShot.url })}`;
  assert.ok(longLine.length > LINE_CAP);
  // 鍵が上限より長い行（頭が鍵の途中で切れる）と、絵でない長い行
  const hugeShot = { ...realShot, stage: "after-behaviors", url: `${realShot.url}&q=${"y".repeat(3000)}` };
  const hugeLine = `${screenshotIndexKey(hugeShot)}${JSON.stringify({ ...fields, url: hugeShot.url, offset: "999" })}`;
  const otherLong = `test,site)/long?${"z".repeat(3000)} 20261113163633 {"url":"https://site.test/long","mime":"text/html","status":"200","length":"10","offset":"1","filename":"data-000.warc.gz"}`;
  const lines = [otherLong, longLine, hugeLine];
  const { fetchJson, calls } = fakeIndex(lines);
  const read = await locateScreenshots(fetchJson, ARCHIVE_ID, [longShot, hugeShot]);
  assert.deepEqual(calls, [indexLinesPath(ARCHIVE_ID, 0), indexLinePath(ARCHIVE_ID, 1), indexLinePath(ARCHIVE_ID, 2)]);
  assert.deepEqual(read.places.get(longShot.url), { path: "archive/data-000.warc.gz", offset: 6576, length: 4232 });
  assert.deepEqual(read.places.get(hugeShot.url), { path: "archive/data-000.warc.gz", offset: 999, length: 4232 });
});

test("索引を読めないときは、理由を返して続きを読まない（404 は見てよくない WACZ）", async () => {
  const shots = screenshotsOf(withShots);
  for (const [status, body, message] of [
    [404, { error: "not found" }, "見つかりません"],
    [400, { code: "badRequest", message: "no entry: indexes/index.cdxj" }, "no entry: indexes/index.cdxj"],
    [502, {}, "HTTP 502"],
  ]) {
    const calls = [];
    const read = await locateScreenshots(async (path) => {
      calls.push(path);
      return { status, body };
    }, ARCHIVE_ID, shots);
    assert.equal(calls.length, 1);
    assert.equal(read.places.size, 0);
    assert.deepEqual(read.error, { status, message });
  }
});

test("残さなかった理由の字は 5 通りで、どれも別の字（日本語と英語）。知らない理由は届いた字のまま", () => {
  assert.deepEqual(SCREENSHOT_SKIPS, ["disabled", "secret", "withheld", "task-budget", "failed"]);
  const ja = SCREENSHOT_SKIPS.map(screenshotSkipText);
  assert.equal(new Set(ja).size, SCREENSHOT_SKIPS.length);
  // 理由ごとに、何が起きたかを言う語が在る
  assert.match(ja[0], /絵を撮る設定になっていない/);
  assert.match(ja[1], /シークレットを渡した/);
  assert.match(ja[2], /方針が文書・画像・メディアを伏せた/);
  assert.match(ja[2], /content-type の方針/);
  assert.match(ja[2], /伏せた文書/);
  assert.match(ja[3], /バイトの上限/);
  assert.match(ja[4], /撮れなかった/);
  setLang("en");
  try {
    const en = SCREENSHOT_SKIPS.map(screenshotSkipText);
    assert.equal(new Set(en).size, SCREENSHOT_SKIPS.length);
    for (const text of en) assert.equal(/[ぁ-ん一-龥]/.test(text), false, text);
    assert.match(en[0], /not set to take screenshots/);
    assert.match(en[1], /secret/);
    assert.match(en[2], /withheld/);
    assert.match(en[3], /byte limit/);
    assert.match(en[4], /could not be taken/);
    assert.equal(screenshotSkipText(""), "no reason is given");
  } finally {
    setLang("ja");
  }
  // BrowserHive が理由を足しても、画面は黙らない（届いた字を出す）。理由の無い項目は、無いと言う
  assert.equal(screenshotSkipText("too-large"), "too-large");
  assert.equal(screenshotSkipText(""), "理由は書かれていない");
  assert.equal(screenshotSkipText(undefined), "理由は書かれていない");
});

test("絵の無い時点の行: 理由が全部同じなら 1 行、時点ごとに違えば時点ごと、絵と混ざれば無い時点だけ", () => {
  // 実物: 2 つの時点とも同じ理由
  assert.deepEqual(screenshotSkipLines(screenshotsOf(withheld)), [{ skipped: "withheld" }]);
  assert.deepEqual(screenshotSkipLines(screenshotsOf(secret)), [{ skipped: "secret" }]);
  // 実物: 絵が 2 枚在る取り込みには、行が無い
  assert.deepEqual(screenshotSkipLines(screenshotsOf(withShots)), []);
  const answerWith = (screenshots) => ({ ...withShots, capture: { ...withShots.capture, screenshots } });
  // 時点ごとに理由が違う（1 枚目が撮れず、2 枚目は試さなかった、ではなく、上限に当たった）
  assert.deepEqual(
    screenshotSkipLines(screenshotsOf(answerWith([{ stage: "after-behaviors", skipped: "task-budget" }, { stage: "after-load", skipped: "failed" }]))),
    [{ stage: "after-load", skipped: "failed" }, { stage: "after-behaviors", skipped: "task-budget" }],
  );
  // 絵の在る時点と混ざる: 無い時点だけを、時点の名前つきで
  assert.deepEqual(
    screenshotSkipLines(screenshotsOf(answerWith([withShots.capture.screenshots[0], { stage: "after-behaviors", skipped: "failed" }]))),
    [{ stage: "after-behaviors", skipped: "failed" }],
  );
  // 時点が 1 つだけの取り込み（スクリプトを送らなかった）
  assert.deepEqual(screenshotSkipLines(screenshotsOf(answerWith([{ stage: "after-load", skipped: "disabled" }]))), [{ skipped: "disabled" }]);
  // 項目が 1 つも無い
  assert.deepEqual(screenshotSkipLines(screenshotsOf(answerWith([]))), []);
});

test("失敗の時点の絵は、答えが真と言うときだけ引く。エンドポイントは経緯のエンドポイントの下", () => {
  assert.equal(failed.capture.status, "http_error");
  assert.equal(failed.capture.failureScreenshot, true);
  assert.equal(hasFailureScreenshot(failed), true);
  for (const answer of [before, withShots, withheld, secret]) assert.equal(hasFailureScreenshot(answer), false);
  // 真偽でない値（場所の字・数）は、在るとは読まない
  assert.equal(hasFailureScreenshot({ capture: { failureScreenshot: "s3://bucket/x.failure.webp" } }), false);
  assert.equal(hasFailureScreenshot({ capture: { failureScreenshot: 1 } }), false);
  assert.equal(hasFailureScreenshot({ capture: null }), false);
  assert.equal(
    failureScreenshotPath("5b0c000b-6a1e-4000-8000-00000000000b", "1307"),
    "/api/crawls/5b0c000b-6a1e-4000-8000-00000000000b/pages/1307/trace/failure-screenshot",
  );
});

test("失敗の時点の絵は、contentType が image/webp の答えだけを data: の URL にする。違えば出さない", () => {
  // 実物: 代役が返す絵（1280×800 の WebP）
  const real = pageFailureScreenshot(crawl, "1307");
  assert.equal(real.status, 200);
  assert.deepEqual(Object.keys(real.body), ["contentType", "base64"]);
  const src = failureScreenshotSrc(real.body);
  assert.equal(src, `data:image/webp;base64,${real.body.base64}`);
  const bytes = Buffer.from(real.body.base64, "base64");
  assert.equal(`${bytes.subarray(0, 4).toString("latin1")} ${bytes.subarray(8, 12).toString("latin1")}`, "RIFF WEBP");
  assert.deepEqual(failureScreenshotOf(200, real.body), { src, bytes: bytes.length });
  assert.equal(base64Bytes(real.body.base64), bytes.length);
  // 同じ中身でも、形式が WebP と言われていなければ出さない（SVG・HTML を、画面のオリジンの data: にしない）
  for (const contentType of ["image/svg+xml", "text/html", "image/png", "IMAGE/WEBP", "image/webp; charset=utf-8", "", undefined, null, 7]) {
    assert.equal(failureScreenshotSrc({ ...real.body, contentType }), undefined, String(contentType));
    const shown = failureScreenshotOf(200, { ...real.body, contentType });
    assert.equal(shown.src, undefined);
    assert.match(shown.error, /image\/webp ではありません/);
  }
  assert.match(failureScreenshotOf(200, { ...real.body, contentType: "image/svg+xml" }).error, /image\/svg\+xml/);
  // base64 でない字（引用符・山括弧・空）は data: に組まない
  for (const base64 of ['AAAA" onerror="x', "<svg>", "", "AAA=A", undefined, 5]) {
    assert.equal(failureScreenshotSrc({ contentType: "image/webp", base64 }), undefined, String(base64));
    assert.deepEqual(failureScreenshotOf(200, { contentType: "image/webp", base64 }), { error: "失敗の時点の絵を出しません（中身が base64 ではありません）" });
  }
  assert.equal(failureScreenshotSrc(null), undefined);
  // 絵が無い（404）・読めない
  assert.deepEqual(failureScreenshotOf(404, { error: "not found" }), { error: "失敗の時点の絵がありません（capture-ledger が 404 を返しました）" });
  assert.deepEqual(failureScreenshotOf(502, {}), { error: "失敗の時点の絵を読めません: HTTP 502" });
  assert.deepEqual(failureScreenshotOf(0, { error: "Failed to fetch" }), { error: "失敗の時点の絵を読めません: Failed to fetch" });
});
