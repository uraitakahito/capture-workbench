import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  changeBandLines,
  changeOf,
  changesError,
  hunkLines,
  parseChangesHash,
  summaryLine,
  versionNote,
} from "../public/changes.js";

const ID = "11111111-1111-4111-8111-111111111111";
const change = (over) => ({ state: "summarized", pagesCompared: 5, pagesChanged: 3, significance: "minor", headline: "h", ...over });

describe("前回からの変化（CAPTURE-167）", () => {
  it("hash は #changes と #changes/<id> だけ", () => {
    assert.deepEqual(parseChangesHash("#changes"), { crawlId: undefined });
    assert.deepEqual(parseChangesHash(`#changes/${ID}`), { crawlId: ID });
    assert.equal(parseChangesHash("#changes/nope"), undefined);
    assert.equal(parseChangesHash("#crawls"), undefined);
  });

  it("回の変化の字と色。無い・古い capture-ledger は「—」", () => {
    assert.deepEqual(changeOf(null), { kind: "", text: "—" });
    assert.deepEqual(changeOf(undefined), { kind: "", text: "—" });
    assert.deepEqual(changeOf(change({ state: "unchanged" })), { kind: "ok", text: "変化なし（5 ページ）" });
    assert.deepEqual(changeOf(change({ significance: "content" })), { kind: "run", text: "中身の変化（3 / 5 ページ）" });
    assert.deepEqual(changeOf(change({ significance: "none" })), { kind: "ok", text: "意味のある変化なし（3 / 5 ページ）" });
    assert.equal(changeOf(change({ state: "budget_wait" })).kind, "bad");
    assert.equal(changeOf(change({ state: "failed" })).kind, "bad");
    assert.equal(changeOf(change({ state: "no_previous" })).text, "初回（前の回が無い）");
  });

  it("帯は直近の回の要約が上限か失敗で止まったときだけ。中身の変化では出さない", () => {
    const schedule = (state) => ({ name: "毎朝", recentRuns: [{ change: change({ state }) }] });
    assert.deepEqual(changeBandLines([schedule("summarized"), schedule("unchanged")]), []);
    assert.equal(changeBandLines([schedule("budget_wait")]).length, 1);
    assert.match(changeBandLines([schedule("failed")])[0], /失敗/);
    assert.deepEqual(changeBandLines([{ name: "x", recentRuns: [] }]), []);
  });

  it("要約には必ず「証拠ではない」と model・版・費用を添える", () => {
    assert.equal(
      summaryLine({ evidence: false, model: "claude-opus-5-5", promptVersion: "change-v1", usd: 0.015 }),
      "Claude の要約（証拠ではない）・claude-opus-5-5・change-v1・$0.0150",
    );
    assert.equal(summaryLine(null), "要約はありません（差分だけ）");
  });

  it("差分の行は記号と字に分ける", () => {
    assert.deepEqual(hunkLines([" a", "-b", "+c"]), [
      { sign: " ", text: "a" },
      { sign: "-", text: "b" },
      { sign: "+", text: "c" },
    ]);
  });

  it("前と今で BrowserHive の版が違えば添える", () => {
    assert.equal(versionNote({ before: { browserhiveVersion: "28.0.1" }, after: { browserhiveVersion: "29.0.0" } }), "BrowserHive 28.0.1 → 29.0.0");
    assert.equal(versionNote({ before: { browserhiveVersion: "29.0.0" }, after: { browserhiveVersion: "29.0.0" } }), "");
  });

  it("404 のうち、変化のエンドポイントが無い古い capture-ledger は、そう言う", () => {
    assert.match(changesError(404, { message: "Route GET:/api/changes not found" }), /v0.93.0 より前/);
    assert.equal(changesError(404, { error: "not found" }), "404 —— not found");
  });
});
