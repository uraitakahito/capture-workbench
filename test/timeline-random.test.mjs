/**
 * 「経緯」の画面の計算のうち、答えの `capture.random`（ページの JS が受け取った乱数の控えの要約。BrowserHive WACZ Profile
 * 1.26.0 の `browserhive:capture.random` を capture-ledger v0.105.0 が通した物。CAPTURE-378）を読む所（`public/timeline.js`）。
 *
 * 形は Profile の表の例（`{ recorded: true, documents: 2, draws: 318, truncated: false }`）と、`skipped` の 3 つの理由。
 * 実物の WACZ はまだ置き場に無い（足すと docs の画像が変わる）ので、答えの欄を手で書く。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { setLang } from "../public/i18n.js";
import { randomOf, randomText } from "../public/timeline.js";

const shown = (random) => randomText(randomOf({ status: "success", random }));

test("乱数を控えた取り込みは、値の行の数を言う", () => {
  assert.deepEqual(randomOf({ random: { recorded: true, documents: 2, draws: 318, truncated: false } }), {
    recorded: true,
    draws: 318,
    truncated: false,
  });
  assert.equal(shown({ recorded: true, documents: 2, draws: 318, truncated: false }), "乱数の控え 318 回");
  assert.equal(shown({ recorded: true, documents: 1, draws: 0, truncated: false }), "乱数の控え 0 回");
  setLang("en");
  try {
    assert.equal(shown({ recorded: true, documents: 2, draws: 318, truncated: false }), "318 random values recorded");
    assert.equal(shown({ recorded: true, documents: 1, draws: 1, truncated: false }), "1 random value recorded");
  } finally {
    setLang("ja");
  }
});

test("行が欠けているかもしれない控え（truncated）には、印を足す", () => {
  assert.equal(shown({ recorded: true, documents: 2, draws: 5000, truncated: true }), "乱数の控え 5,000 回（欠けがありうる）");
  setLang("en");
  try {
    assert.equal(shown({ recorded: true, documents: 2, draws: 5000, truncated: true }), "5,000 random values recorded (may be incomplete)");
  } finally {
    setLang("ja");
  }
});

test("文書を伏せた取り込み（withheld）は、控えを残さなかったと言う", () => {
  assert.deepEqual(randomOf({ random: { recorded: false, skipped: "withheld" } }), { recorded: false, skipped: "withheld" });
  assert.equal(shown({ recorded: false, skipped: "withheld" }), "乱数は控えていない（文書を伏せたので残さない）");
  setLang("en");
  try {
    assert.equal(shown({ recorded: false, skipped: "withheld" }), "random values not kept (the document was withheld)");
  } finally {
    setLang("ja");
  }
});

test("控えられなかった取り込み（failed）は、そう言う。知らない理由は届いた字のまま", () => {
  assert.equal(shown({ recorded: false, skipped: "failed" }), "乱数を控えられなかった");
  assert.equal(shown({ recorded: false, skipped: "too-large" }), "乱数は控えていない（too-large）");
  assert.equal(shown({ recorded: false }), "乱数は控えていない（理由は書かれていない）");
  setLang("en");
  try {
    assert.equal(shown({ recorded: false, skipped: "failed" }), "random values could not be recorded");
  } finally {
    setLang("ja");
  }
});

test("頼まなかった取り込み（not-requested）には、何も足さない", () => {
  assert.deepEqual(randomOf({ random: { recorded: false, skipped: "not-requested" } }), {
    recorded: false,
    skipped: "not-requested",
  });
  assert.equal(shown({ recorded: false, skipped: "not-requested" }), undefined);
});

test("欄の無い取り込み（capture-ledger v0.105.0 より前）と、読めない形には、何も足さない", () => {
  assert.equal(randomOf({ status: "success" }), undefined);
  assert.equal(randomText(randomOf({ status: "success" })), undefined);
  assert.equal(randomText(randomOf(undefined)), undefined);
  for (const random of [null, "recorded", { recorded: "yes" }, { recorded: true }]) {
    assert.equal(randomOf({ random }), undefined, JSON.stringify(random));
    assert.equal(shown(random), undefined, JSON.stringify(random));
  }
});
