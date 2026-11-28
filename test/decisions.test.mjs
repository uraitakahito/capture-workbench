/**
 * クロールの行を開いたときの「規則が何を決めたか」（`public/decisions.js`）。capture-ledger の
 * `GET /api/crawls/:id/decisions` の答え（capture-ledger v0.62.0 の形）を数え直すだけ。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { dropsOf, inspectHref, overriddenOf, ruleTallies } from "../public/decisions.js";
import { count } from "../public/format.js";
import { setLang, t } from "../public/i18n.js";

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

const RULES = [
  { skip: "skipped.invalid" },
  { skip: "tracker.third-site.test" },
  { follow: "same-host" },
  { capture: "any" },
];
const row = (depth, rule, action, hostname, links, sample) => ({
  depth,
  rule,
  action,
  hostname,
  links,
  samples: [sample],
});
const DECIDED = [
  row(1, 1, "skip", "skipped.invalid", 1, "http://skipped.invalid/page"),
  row(1, 3, "follow", "capture-fixtures.capture-ledger", 1, "http://capture-fixtures.capture-ledger:8080/links/leaf/1"),
  row(1, 4, "capture", "outside.invalid", 1, "http://outside.invalid/page"),
  row(2, 1, "skip", "skipped.invalid", 2, "http://skipped.invalid/a"),
  row(2, 0, "skip", "nowhere.invalid", 1, "http://nowhere.invalid/"),
];

test("規則ごとの数は段を跨いで足し、0 回の規則も行にし、どれにも当たらない物を最後に置く", () => {
  assert.deepEqual(ruleTallies(RULES, DECIDED), [
    { rule: 1, action: "skip", pattern: "skipped.invalid", links: 3 },
    { rule: 2, action: "skip", pattern: "tracker.third-site.test", links: 0 },
    { rule: 3, action: "follow", pattern: "same-host", links: 1 },
    { rule: 4, action: "capture", pattern: "any", links: 1 },
    { rule: 0, action: "skip", pattern: "", links: 1 },
  ]);
});

test("どれにも当たらない物が無ければ、その行は足さない", () => {
  assert.equal(ruleTallies(RULES, DECIDED.filter((r) => r.rule !== 0)).length, RULES.length);
});

test("落とした物は、規則とホスト名ごとに段を跨いで足し、robots.txt の分を後ろに。辿った物と撮るだけは入れない", () => {
  const robots = [{ hostname: "capture-fixtures.capture-ledger", pages: 1, samples: ["http://capture-fixtures.capture-ledger:8080/links/hidden"] }];
  assert.deepEqual(dropsOf(DECIDED, robots), [
    { why: 1, hostname: "skipped.invalid", links: 3, sample: "http://skipped.invalid/page" },
    { why: 0, hostname: "nowhere.invalid", links: 1, sample: "http://nowhere.invalid/" },
    { why: "robots", hostname: "capture-fixtures.capture-ledger", links: 1, sample: "http://capture-fixtures.capture-ledger:8080/links/hidden" },
  ]);
});

test("robots.txt を例外で外して撮った物は、例外とホスト名ごとの行のまま（例は最初の 1 本）。落とした物には混ぜない", () => {
  const robotsOverridden = [
    { exemptionId: "12", hostname: "site.test", pages: 3, failed: 2, samples: ["https://site.test/private/a", "https://site.test/private/b"] },
    { exemptionId: "12", hostname: "www.site.test", pages: 1, failed: 0, samples: [] },
    // failed の無い行（欄を足す前の答え）は 0
    { exemptionId: "15", hostname: "site.test", pages: 2, samples: ["https://site.test/members/"] },
  ];
  // pages は撮れた数、failed は外して撮りに行き撮れなかった数（pages に足さない）
  assert.deepEqual(overriddenOf(robotsOverridden), [
    { exemptionId: "12", hostname: "site.test", pages: 3, failed: 2, sample: "https://site.test/private/a" },
    { exemptionId: "12", hostname: "www.site.test", pages: 1, failed: 0, sample: "" },
    { exemptionId: "15", hostname: "site.test", pages: 2, failed: 0, sample: "https://site.test/members/" },
  ]);
  // 欄の無い答え（capture-ledger v0.117.0 より前）と空の並びは、何も出さない
  assert.deepEqual(overriddenOf(undefined), []);
  assert.deepEqual(overriddenOf([]), []);
  // 落とした物は、外して撮った物を数えない（robots の行だけ）
  assert.deepEqual(dropsOf([], [{ hostname: "site.test", pages: 1, samples: ["https://site.test/admin/"] }]), [
    { why: "robots", hostname: "site.test", links: 1, sample: "https://site.test/admin/" },
  ]);
});

test("robots.txt で落とした行は、例外の上限で止まった数（limited）が 1 以上のときだけ、それを持つ", () => {
  const robots = (limited) => [{ hostname: "site.test", pages: 3, ...(limited === undefined ? {} : { limited }), samples: ["https://site.test/admin/"] }];
  const plain = { why: "robots", hostname: "site.test", links: 3, sample: "https://site.test/admin/" };
  // limited は pages に含まれる（数は足さない）
  assert.deepEqual(dropsOf([], robots(2)), [{ ...plain, limited: 2 }]);
  assert.deepEqual(dropsOf([], robots(0)), [plain]);
  // 欄の無い答え（capture-ledger v0.117.0 より前）
  assert.deepEqual(dropsOf([], robots(undefined)), [plain]);
});

test("開いた行の字: 「うち上限で止まった N」と「撮れなかった N」", () => {
  assert.equal(t("crawls.decided.limited", { n: 1204 }), "うち上限で止まった 1,204");
  assert.equal(t("crawls.decided.overriddenFailed", { n: 2 }), "撮れなかった 2");
  assert.equal(inEnglish(() => t("crawls.decided.limited", { n: 1 })), "1 of them stopped by the limit");
  assert.equal(inEnglish(() => t("crawls.decided.overriddenFailed", { n: 2 })), "2 failed");
});

test("Windmill の走らせる画面は、hash に JSON の引数を置いて開く（id は全部）", () => {
  const href = inspectHref("http://127.0.0.1:8000", "crawler", "5b0c0007-6a1e-4000-8000-000000000007");
  assert.equal(
    href,
    "http://127.0.0.1:8000/scripts/get/f/waggle/inspect_crawl?workspace=crawler" +
      "#crawl=%225b0c0007-6a1e-4000-8000-000000000007%22",
  );
  // hash の値を戻すと、Windmill が読む JSON の文字列になる
  const value = decodeURIComponent(new URL(href).hash.slice("#crawl=".length));
  assert.equal(JSON.parse(value), "5b0c0007-6a1e-4000-8000-000000000007");
});

// ── 開いた行の字（app.js が描く。CAPTURE-294）。数は count() の字のまま、英語は単数と複数を言い分ける ───────

test("規則ごとの数と落とした物の数は「N 本」。英語は URL の単数と複数", () => {
  const urls = (n) => t("crawls.decided.urls", { n });
  assert.deepEqual([0, 1, 1204].map(urls), ["0 本", "1 本", "1,204 本"]);
  assert.deepEqual(inEnglish(() => [0, 1, 2, 1204].map(urls)), ["0 URLs", "1 URL", "2 URLs", "1,204 URLs"]);
});

test("走らせたものの行: 登録済みは版と phase、その場の物は phase と大きさ（phase は訳さない）", () => {
  const inline = (n) => t("crawls.detail.inline", { phase: "behavior", n });
  assert.equal(inline(1589), "その場・behavior・1,589 バイト");
  assert.equal(inEnglish(() => inline(1)), "your script · behavior · 1 byte");
  assert.equal(inEnglish(() => inline(1589)), "your script · behavior · 1,589 bytes");
  assert.equal(t("crawls.detail.registered", { version: 2, phase: "preload" }), "登録 v2・preload");
  assert.equal(inEnglish(() => t("crawls.detail.registered", { version: 2, phase: "preload" })), "registered v2 · preload");
});
