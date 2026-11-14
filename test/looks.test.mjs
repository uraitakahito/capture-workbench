/**
 * 一覧の行の「見た目」（`public/looks.js`。CAPTURE-432）。capture-ledger v0.107.0 が一覧の行（`GET /api/archives` と
 * クロールのページの行）に返す `screenshot` を、出す物の形にする所。形は capture-ledger の `src/api/stage-screenshot.ts`。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { forgetMissing } from "../public/format.js";
import { setLang } from "../public/i18n.js";
import { LOOK_STAGE, lookFor, lookOf, lookSrc, lookUnreadable } from "../public/looks.js";
import { screenshotSkipText, SCREENSHOT_SKIPS } from "../public/timeline.js";
import { isScreenshotRoute } from "../src/lib.mjs";

const ID = "5e6d1ed0-c5b0-35a7-b71b-517fa8aa6b97";
const picture = { stage: "after-load", bytes: 5624 };

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

test("絵の在る行は、中継を通る絵の path。id は % で包み、時点は読み込みの後", () => {
  assert.deepEqual(lookOf({ screenshot: picture, archiveId: ID }), {
    kind: "picture",
    src: `/api/archives/${ID}/screenshots/after-load`,
  });
  assert.equal(LOOK_STAGE, "after-load");
  // id は capture-ledger の UUID だが、字のまま path に入れない
  assert.equal(lookSrc("a/../b?c"), "/api/archives/a%2F..%2Fb%3Fc/screenshots/after-load");
});

test("絵の path は、中継がバイト列のまま通す形（src/lib.mjs の isScreenshotRoute）に通る", () => {
  assert.equal(isScreenshotRoute(lookOf({ screenshot: picture, archiveId: ID }).src), true);
  // 形の違う id の path は通らない（字として中継され、絵にはならない）
  assert.equal(isScreenshotRoute(lookSrc("a/../b")), false);
});

test("skipped が字なら、bytes が在っても絵にしない —— 残さなかった時点の絵を引きに行かない", () => {
  const look = lookOf({ screenshot: { stage: "after-load", bytes: 5624, skipped: "secret" }, archiveId: ID });
  assert.equal(look.kind, "none");
  assert.equal(look.why, "（シークレット）");
});

test("残さなかった理由ごとの短い字。全文は経緯の画面と同じ字（screenshotSkipText）", () => {
  const whyOf = (skipped) => lookOf({ screenshot: { stage: "after-load", skipped }, archiveId: ID });
  assert.deepEqual(
    SCREENSHOT_SKIPS.map((skipped) => [skipped, whyOf(skipped).why]),
    [
      ["disabled", "（設定が切）"],
      ["secret", "（シークレット）"],
      ["withheld", "（伏せた応答）"],
      ["task-budget", "（撮れず）"],
      ["failed", "（撮れず）"],
    ],
  );
  for (const skipped of SCREENSHOT_SKIPS) {
    assert.equal(whyOf(skipped).title, `BrowserHive が絵を残さなかった: ${screenshotSkipText(skipped)}`, skipped);
  }
});

test("知らない理由は「撮れず」で、全文には届いた字をそのまま出す", () => {
  const look = lookOf({ screenshot: { stage: "after-load", skipped: "too-dark" }, archiveId: ID });
  assert.equal(look.why, "（撮れず）");
  assert.equal(look.title, "BrowserHive が絵を残さなかった: too-dark");
});

test("位置を引けなかった行は「読めず」で、全文に capture-ledger の理由の字", () => {
  const look = lookOf({ screenshot: { stage: "after-load", problem: "no-index-line" }, archiveId: ID });
  assert.deepEqual(look, { kind: "none", why: "（読めず）", title: "WACZ の中の絵の位置を読めませんでした（no-index-line）" });
});

test("null は「記録なし」で、残さなかった理由の字（撮れず・読めず）と取り違えない", () => {
  const look = lookOf({ screenshot: null, archiveId: ID });
  assert.equal(look.kind, "none");
  assert.equal(look.why, "（記録なし）");
  assert.match(look.title, /節目のスクリーンショットの記録がありません/);
  const said = [
    lookOf({ screenshot: { stage: "after-load", skipped: "failed" }, archiveId: ID }).why,
    lookOf({ screenshot: { stage: "after-load", problem: "warc-not-stored" }, archiveId: ID }).why,
    lookUnreadable().why,
  ];
  assert.equal(said.includes(look.why), false);
});

test("欄の無い行（古い capture-ledger）には何も出さない —— 「記録なし」と言わない", () => {
  assert.equal(lookOf({ archiveId: ID }), undefined);
  assert.equal(lookOf({ id: "1201", url: "https://sandbox.test/search", archiveId: ID }), undefined);
});

test("WACZ の無い行（pending・failed・skipped のページ）に「記録なし」と言わない。絵の欄が在っても出さない", () => {
  assert.equal(lookOf({ screenshot: null, archiveId: null }), undefined);
  assert.equal(lookOf({ screenshot: null }), undefined);
  assert.equal(lookOf({ screenshot: null, archiveId: "" }), undefined);
  assert.equal(lookOf({ screenshot: picture, archiveId: null }), undefined);
});

test("形の違う値は undefined（落とさない）", () => {
  for (const screenshot of ["after-load", 3, true, [], {}, { bytes: 5624 }, { stage: 1, bytes: 5624 }, { stage: "after-load" }, { stage: "after-load", bytes: "5624" }]) {
    assert.equal(lookOf({ screenshot, archiveId: ID }), undefined, JSON.stringify(screenshot));
  }
});

test("読めなかった絵の箱は「読めず」", () => {
  assert.deepEqual(lookUnreadable(), { kind: "none", why: "（読めず）", title: "絵を読めませんでした（capture-ledger が絵を返さなかった）" });
});

test("覚えた要素は 2 度作らない。消えた id は忘れ、また出れば作り直す", () => {
  const map = new Map();
  let made = 0;
  const make = () => ({ n: (made += 1) });
  const first = lookFor(map, "a", make);
  assert.equal(lookFor(map, "a", make), first);
  assert.equal(lookFor(map, "b", make).n, 2);
  assert.equal(made, 2);
  forgetMissing(map, ["b"]);
  assert.deepEqual([...map.keys()], ["b"]);
  assert.notEqual(lookFor(map, "a", make), first);
  assert.equal(made, 3);
});

test("英語: 短い字と全文", () => {
  inEnglish(() => {
    const whyOf = (screenshot) => lookOf({ screenshot, archiveId: ID }).why;
    assert.deepEqual(
      [
        whyOf({ stage: "after-load", skipped: "withheld" }),
        whyOf({ stage: "after-load", skipped: "secret" }),
        whyOf({ stage: "after-load", skipped: "disabled" }),
        whyOf({ stage: "after-load", skipped: "failed" }),
        whyOf({ stage: "after-load", problem: "record-mismatch" }),
        whyOf(null),
      ],
      ["(withheld response)", "(secret)", "(turned off)", "(not taken)", "(unreadable)", "(no record)"],
    );
    assert.equal(
      lookOf({ screenshot: { stage: "after-load", skipped: "secret" }, archiveId: ID }).title,
      `BrowserHive kept no screenshot: ${screenshotSkipText("secret")}`,
    );
    assert.match(lookOf({ screenshot: null, archiveId: ID }).title, /^This WACZ has no record of stage screenshots/);
  });
});
