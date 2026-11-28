/**
 * `scripts/check-ask.mjs` の見分け方（t-evv8）。画面の頼みが `ask` を通らずに `fetch` を直に呼ぶと、言語が付かず、
 * capture-ledger が英語で返す。検査が、呼び方の形を取りこぼさないことを見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { bareFetches } from "../scripts/check-ask.mjs";

const found = (file, text) => bareFetches(file, text).map(({ n }) => n);

test("直に呼ぶ fetch を、形を問わず拾う", () => {
  assert.deepEqual(found("public/x.js", 'const res = await fetch("/api/crawls");'), [1]);
  assert.deepEqual(found("public/x.js", 'window.fetch("/api/crawls");'), [1]);
  assert.deepEqual(found("public/x.js", "const f = fetch;\nf(path);"), [1]);
  assert.deepEqual(found("public/x.js", "a();\n  return globalThis.fetch(path, init);"), [2]);
});

test("注と、fetch を含む別の名前は拾わない", () => {
  assert.deepEqual(found("public/x.js", " * 画面は `fetch`、試験は偽物を渡す"), []);
  assert.deepEqual(found("public/x.js", "// fetch(path) は使わない"), []);
  assert.deepEqual(found("public/x.js", "const x = 1; // fetch の代わり"), []);
  assert.deepEqual(found("public/x.js", "const { status } = await fetchJson(path);\nautofetch();"), []);
  assert.deepEqual(found("public/x.js", "const x = 1; /* fetch は使わない */"), []);
});

test("注の後ろに code が在る行は見る", () => {
  assert.deepEqual(found("public/x.js", "/* 予定 */ fetch(p);"), [1]);
  assert.deepEqual(found("public/x.js", "a(); /* 注 */ window.fetch(p); // 後ろの注"), [1]);
});

test("許すのは、app.js の ask の中の 1 つだけ", () => {
  const ask = '  fetch(path, { ...init, headers: { ...init.headers, "accept-language": langOf() } });';
  assert.deepEqual(found("public/app.js", ask), []);
  // 同じ形でも、ほかの file では許さない
  assert.deepEqual(found("public/start.js", ask), [1]);
  // app.js のほかの fetch は許さない
  assert.deepEqual(found("public/app.js", `${ask}\nconst res = await fetch(path);`), [2]);
});

test("いまの public/app.js は、ask の中の 1 つだけ", () => {
  assert.deepEqual(found("public/app.js", readFileSync("public/app.js", "utf8")), []);
  assert.equal(readFileSync("public/app.js", "utf8").split("accept-language").length - 1, 1);
});
