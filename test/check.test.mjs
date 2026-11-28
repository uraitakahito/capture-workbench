/**
 * 検証の画面（CAPTURE-457）の純関数。報告の `rules`（wacz-validator v0.52.0 から）の並べ方・数え方・印・URL。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkBandOf,
  checkHref,
  checkVerdict,
  countsText,
  flaggedEntries,
  ruleGroupsOf,
  hasRules,
  notRunText,
  opensFirst,
  outcomeMark,
  parseCheckHref,
  issuePlaceOf,
  tallyOf,
  verdict,
} from "../public/check.js";
import { setLang } from "../public/i18n.js";

const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

const zero = { error: 0, warning: 0, info: 0 };
const rule = (name, outcome, extra = {}) => ({ rule: name, outcome, counts: zero, description: `${name} の説明`, docs: [], conformance: "MUST", ...extra });

test("URL: 既定の profile は書かず、知らない profile と形の合わない URL は読まない", () => {
  assert.equal(checkHref("a/b"), "/check/a%2Fb");
  assert.equal(checkHref("x", "spec"), "/check/x");
  assert.equal(checkHref("x", "browserhive"), "/check/x/browserhive");
  assert.deepEqual(parseCheckHref("/check/a%2Fb"), { archiveId: "a/b", profile: "spec" });
  assert.deepEqual(parseCheckHref("/check/x/browserhive"), { archiveId: "x", profile: "browserhive" });
  // 往復して同じ所へ
  for (const p of ["spec", "browserhive"]) assert.deepEqual(parseCheckHref(checkHref("id 1", p)), { archiveId: "id 1", profile: p });
  assert.equal(parseCheckHref("/check/x/lenient"), undefined);
  assert.equal(parseCheckHref("/check/"), undefined);
  assert.equal(parseCheckHref("/check/x/spec/more"), undefined);
  assert.equal(parseCheckHref("/archive/x"), undefined);
  assert.equal(parseCheckHref("/check/%E0%A4%A"), undefined); // decode できない
});

test("結論は rule で数え、落ちた rule が在れば赤・警告の rule が在れば黄", () => {
  const report = (outcomes) => ({ rules: outcomes.map((o, i) => rule(`a/${String(i)}`, o)) });
  assert.deepEqual(verdict(report(["passed", "failed", "failed", "warned"])), { text: "落ちた rule 2", kind: "bad" });
  assert.deepEqual(verdict(report(["passed", "warned", "noted"])), { text: "警告の rule 1", kind: "warn" });
  // info だけ・見なかった rule は、結論を赤や黄にしない
  assert.deepEqual(verdict(report(["passed", "noted", "excluded", "skipped"])), { text: "問題なし", kind: "ok" });
  // 知らない結果を緑にしない
  assert.equal(verdict(report(["passed", "something-new"])).kind, "warn");
  assert.equal(inEnglish(() => verdict(report(["failed"])).text), "1 rule failed");
});

test("rule ごとの結果を持たない報告（v0.52.0 より前の daemon）は、古いと言う", () => {
  const old = { summary: { passed: 28, failed: 0, warnings: 0 }, issues: [], entries: [] };
  assert.equal(hasRules(old), false);
  assert.deepEqual(verdict(old), { text: "daemon が古い", kind: "bad" });
  assert.equal(hasRules({ rules: [] }), true);
});

test("一覧の欄の結論: 未検証は空・検証できなかったは「検証できず」", () => {
  assert.equal(checkVerdict(undefined), undefined);
  assert.deepEqual(checkVerdict(new Error("x")), { text: "検証できず", kind: "bad" });
  assert.deepEqual(checkVerdict({ rules: [rule("a/x", "passed")] }), { text: "問題なし", kind: "ok" });
});

test("帯: 0 の結果は出さず、走らせなかった rule は 1 つにまとめ、最後に本数", () => {
  const rules = [rule("a/1", "failed"), rule("a/2", "passed"), rule("a/3", "passed"), rule("b/1", "excluded"), rule("b/2", "skipped")];
  assert.deepEqual(checkBandOf(rules), [
    { text: "✕ 落ちた 1", kind: "bad" },
    { text: "✓ 通った 2", kind: "ok" },
    { text: "– 見なかった 2", kind: "muted" },
    { text: "rule 5 本", kind: "muted" },
  ]);
  assert.deepEqual(tallyOf([...rules, rule("c/1", "?")]).other, 1);
});

test("束ね方: 範囲は登録の順、束の中は重い順・同じ結果は登録の順、見なかった rule は別の束", () => {
  const rules = [
    rule("wacz/a", "passed"),
    rule("cdxj/a", "passed"),
    rule("wacz/b", "failed"),
    rule("cdxj/b", "warned"),
    rule("wacz/c", "noted"),
    rule("browserhive/a", "excluded"),
    rule("wacz/d", "failed"),
    rule("wacz/e", "new-outcome"),
    rule("cdxj/c", "skipped", { range: ">=2.0.0" }),
  ];
  const { ran, notRun } = ruleGroupsOf(rules);
  assert.deepEqual(
    ran.map((g) => [g.area, g.rules.map((r) => r.rule)]),
    [
      ["wacz", ["wacz/b", "wacz/d", "wacz/e", "wacz/c", "wacz/a"]],
      ["cdxj", ["cdxj/b", "cdxj/a"]],
    ],
  );
  assert.deepEqual(
    notRun.map((g) => [g.area, g.rules.map((r) => r.rule)]),
    [
      ["cdxj", ["cdxj/c"]],
      ["browserhive", ["browserhive/a"]],
    ],
  );
});

test("印と、最初から開く rule", () => {
  assert.deepEqual(outcomeMark("failed"), { glyph: "✕", kind: "bad" });
  assert.deepEqual(outcomeMark("passed"), { glyph: "✓", kind: "ok" });
  assert.deepEqual(outcomeMark("excluded"), { glyph: "–", kind: "muted" });
  assert.notEqual(outcomeMark("new-outcome").kind, "ok");
  assert.equal(opensFirst(rule("a/x", "failed")), true);
  assert.equal(opensFirst(rule("a/x", "warned")), true);
  assert.equal(opensFirst(rule("a/x", "new-outcome")), true);
  assert.equal(opensFirst(rule("a/x", "passed")), false);
  assert.equal(opensFirst(rule("a/x", "noted")), false);
});

test("数と、見なかった理由", () => {
  assert.equal(countsText({ error: 3, warning: 0, info: 1 }), "error 3 · info 1");
  assert.equal(countsText(zero), "");
  assert.equal(notRunText(rule("a/x", "excluded"), "spec"), "profile spec では見ない");
  assert.equal(notRunText(rule("a/x", "skipped", { range: ">=1.11.0" }), "browserhive"), "版の条件 >=1.11.0 の外なので見なかった");
  assert.equal(inEnglish(() => notRunText(rule("a/x", "excluded"), "spec")), "not run under the spec profile");
});

test("場所: 行の在る指摘は WACZ の画面のその行（0 始まり）へ、byte の位置は字だけ、entry の無い指摘は無し", () => {
  assert.deepEqual(issuePlaceOf("id", { location: { entry: "indexes/index.cdxj", line: 12 } }), {
    text: "indexes/index.cdxj:12",
    href: "/archive/id/indexes%2Findex.cdxj:11",
  });
  assert.deepEqual(issuePlaceOf("id", { location: { entry: "archive/data.warc.gz", offset: 4096 } }), {
    text: "archive/data.warc.gz @4096",
    href: "/archive/id/archive%2Fdata.warc.gz",
  });
  assert.equal(issuePlaceOf("id", { location: { line: 3 } }), undefined);
  assert.equal(issuePlaceOf("id", {}), undefined);
});

test("印を付ける entry は、欠けた物と指摘のある物", () => {
  assert.equal(
    flaggedEntries([
      { path: "a", present: true, issues: [] },
      { path: "b", present: false, issues: [] },
      { path: "c", present: true, issues: [{ rule: "x", severity: "warning" }] },
    ]),
    2,
  );
});
