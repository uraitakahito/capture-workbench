/**
 * 型の誤りと直し方の読み方（`public/fix.js`・CAPTURE-49）。描くのは app.js で、書く口の形は `lib.test.mjs` が見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { diagnosisOf, diffOf, failedOnTypes, fixAnswer, hasErrorsIn, lacksValues, noteText } from "../public/fix.js";

/** 代役の 5b0c0008（sandbox/scenario.json）と同じ、行に残った失敗の文。 */
const FAILED =
  "[compile] compile 422 CompileFailed: 型の誤り 1 件。最初の 1 件: inline-close-banner.ts:2:18 TS7006 Parameter 'el' implicitly has an 'any' type.";

test("型の検査で落ちた失敗の文だけを、誤りを取り直す相手と読む", () => {
  assert.equal(failedOnTypes(FAILED), true);
  assert.equal(failedOnTypes("compile 422 CompileFailed: 型の誤り 708 件。"), true);
  // 検査の口に届かなかった・取り込みで落ちた・失敗の文が無い
  assert.equal(failedOnTypes("[compile] compile 503 Unavailable: ts-compile-service に届かない"), false);
  assert.equal(failedOnTypes("timeout: Task processing (45000ms)"), false);
  assert.equal(failedOnTypes(null), false);
  assert.equal(failedOnTypes(undefined), false);
});

test("取り直した誤りを、スクリプト・どこ・code・文の行にする（lib の誤りは file のまま）", () => {
  const said = diagnosisOf(200, {
    typescript: "6.0.3",
    diagnostics: [
      { script: "inline-close-banner", line: 2, col: 18, code: "TS7006", message: "Parameter 'el' implicitly has an 'any' type." },
      { file: "lib.dom.d.ts", line: 3, code: "TS2300", message: "dup" },
      { code: "TS5023", message: "no file" },
    ],
  });
  assert.equal(said.kind, "errors");
  assert.equal(said.typescript, "6.0.3");
  assert.deepEqual(said.rows, [
    { script: "inline-close-banner", where: "inline-close-banner", at: "2:18", code: "TS7006", message: "Parameter 'el' implicitly has an 'any' type." },
    { script: undefined, where: "lib.dom.d.ts", at: "3", code: "TS2300", message: "dup" },
    { script: undefined, where: "—", at: "—", code: "TS5023", message: "no file" },
  ]);
});

test("誤りが無ければ通ると言い、口の無い 404 と行の無い 404 を言い分け、ほかは台帳の文のまま", () => {
  assert.deepEqual(diagnosisOf(200, { typescript: "6.0.3", hostTypes: "v0.6.0", diagnostics: [] }), {
    kind: "clean",
    typescript: "6.0.3",
  });
  const noRoute = diagnosisOf(404, { message: "Route GET:/api/crawls/x/diagnostics not found", error: "Not Found" });
  assert.match(noRoute.text, /CAPTURE_LEDGER_TS_COMPILE_URL/);
  assert.deepEqual(diagnosisOf(404, { error: "not found" }), { kind: "trouble", text: "404 —— not found" });
  assert.deepEqual(diagnosisOf(503, { error: "ts-compile unreachable" }), {
    kind: "trouble",
    text: "503 —— ts-compile unreachable",
  });
  assert.equal(diagnosisOf(0, { error: "fetch failed" }).kind, "trouble");
});

test("直し方を訊けるのは、誤りの在るスクリプトだけ", () => {
  const said = diagnosisOf(200, {
    typescript: "6.0.3",
    diagnostics: [{ script: "inline-close-banner", line: 2, col: 18, code: "TS7006", message: "m" }, { file: "lib.dom.d.ts", code: "TS2300", message: "m" }],
  });
  assert.equal(hasErrorsIn(said, "inline-close-banner"), true);
  assert.equal(hasErrorsIn(said, "inline-other"), false);
  assert.equal(hasErrorsIn(diagnosisOf(200, { typescript: "6.0.3", diagnostics: [] }), "inline-close-banner"), false);
  assert.equal(hasErrorsIn(undefined, "inline-close-banner"), false);
});

test("必須の変数が足りない行では、どのスクリプトにも直し方を訊かない —— 台帳の口が Claude を呼ばず 422 で断るので", () => {
  const said = diagnosisOf(200, {
    typescript: "6.0.3",
    diagnostics: [
      { script: "inline-search", line: 2, col: 11, code: "BH0001", message: "必須の変数 query が渡されていない" },
      { script: "inline-close-banner", line: 2, col: 18, code: "TS7006", message: "m" },
    ],
  });
  assert.equal(lacksValues(said), true);
  assert.equal(hasErrorsIn(said, "inline-search"), false);
  assert.equal(hasErrorsIn(said, "inline-close-banner"), false);
  // BH0001 が無ければ、ふつうの誤りの行として訊ける
  const typed = diagnosisOf(200, {
    typescript: "6.0.3",
    diagnostics: [{ script: "inline-close-banner", line: 2, col: 18, code: "TS7006", message: "m" }],
  });
  assert.equal(lacksValues(typed), false);
  assert.equal(hasErrorsIn(typed, "inline-close-banner"), true);
  assert.equal(lacksValues(undefined), false);
  assert.equal(lacksValues(diagnosisOf(503, { error: "ts-compile unreachable" })), false);
});

test("200 は、何の検査に通った直しかと、回数と費用を言う", () => {
  const said = fixAnswer(200, {
    rounds: 1,
    compiled: { typescript: "6.0.3", hostTypes: "v0.6.0" },
    usage: { inputTokens: 3100, outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0.0304 },
  });
  assert.deepEqual(said, { kind: "ok", text: "TypeScript 6.0.3・受け皿の型 v0.6.0 の検査に通った直し（1 往復・$0.0304）" });
});

test("429 は、この月に使った額と上限を添える。ほかは台帳の文に、回数と費用があれば添える", () => {
  assert.deepEqual(fixAnswer(429, { error: "claude budget exhausted", spentUsd: 5.0123, budgetUsd: 5 }), {
    kind: "bad",
    text: "429 —— claude budget exhausted（この月 $5.0123・上限 $5。Claude は呼んでいません）",
  });
  assert.deepEqual(fixAnswer(422, { error: "no fix passed the checks", rounds: 2, usage: { usd: 0.0612 } }), {
    kind: "bad",
    text: "422 —— no fix passed the checks（2 往復・$0.0612）",
  });
  assert.deepEqual(fixAnswer(409, { error: "scripts compile", typescript: "6.0.3", hostTypes: "v0.6.0" }), {
    kind: "warn",
    text: "409 —— scripts compile",
  });
  assert.deepEqual(fixAnswer(503, { error: "ts-compile unreachable" }), { kind: "bad", text: "503 —— ts-compile unreachable" });
  // 鍵の無い台帳は口ごと出さない（Fastify の 404）。行やその場の TS が無い 404 とは言い分ける
  const noRoute = fixAnswer(404, { message: "Route POST:/api/crawls/x/inline/y/fix not found", error: "Not Found" });
  assert.match(noRoute.text, /CAPTURE_LEDGER_ANTHROPIC_API_KEY/);
  assert.deepEqual(fixAnswer(404, { error: "not found" }), { kind: "bad", text: "404 —— not found" });
  assert.equal(fixAnswer(0, { error: "fetch failed" }).kind, "bad");
});

test("差分は、消した行を元の行番号で、足した行を直した版の行番号で数える", () => {
  const hunks = diffOf([
    { from: 1, to: 1, before: ["const a = 1;"], after: ["(() => {", "  const a = 1;"] },
    { from: 3, to: 4, before: ["x;", "y;"], after: ["  x;"] },
  ]);
  assert.deepEqual(hunks, [
    {
      title: "1 行目",
      lines: [
        { sign: "-", no: 1, text: "const a = 1;" },
        { sign: "+", no: 1, text: "(() => {" },
        { sign: "+", no: 2, text: "  const a = 1;" },
      ],
    },
    {
      // 1 行目で 1 行増えたので、元の 3 行目は直した版の 4 行目
      title: "3〜4 行目",
      lines: [
        { sign: "-", no: 3, text: "x;" },
        { sign: "-", no: 4, text: "y;" },
        { sign: "+", no: 4, text: "  x;" },
      ],
    },
  ]);
  assert.deepEqual(diffOf(undefined), []);
});

test("理由は、code・行・どう直したかの 1 行", () => {
  assert.equal(noteText({ code: "TS7006", line: 2, why: "引数に型を付けた" }), "TS7006（2 行目）: 引数に型を付けた");
});
