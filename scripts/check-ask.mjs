/**
 * 画面の code（`public/`）が、`fetch` を直に呼んでいないかを見張る（t-evv8）。
 *
 * ## なぜ要るのか
 *
 * 画面の頼みは、いまの画面の言語を `Accept-Language` で付けて送る（`public/app.js` の `ask`）。capture-ledger は、
 * 自分で訳す文（クロールの失敗の文）をその言語で返し、**言語の付かない頼みには英語で返す**。`fetch` を直に呼ぶ
 * 頼みが 1 つでも在ると、日本語の画面に英語の文が出る。試験は画面の code を import しない（代役で開いて見る）
 * ので、付け忘れは試験に掛からない。
 *
 * ## 何を見るか
 *
 * `public/` の `.js`（`vendor/` を除く）の、注でない行に在る語 `fetch`。許すのは、`app.js` の `ask` の中の
 * 1 つだけ。語で見るので、`window.fetch(…)` も、変数に入れてから呼ぶ形も拾う。`fetchJson` や `autofetch` の
 * ような、`fetch` を含む別の名前は当たらない。
 *
 * ## 見ないもの
 *
 * 注（`*` で始まる行・`//` の後ろ・ブロックの注の中）。ブロックの注の後ろに code が在る行は見る。
 * highlight-worker.js のような、頼みをしない file も同じ決まりで見る（`fetch` を足したら、ここで止まる）。
 * `.html` の中の script は見ない（いまの index.html・signin.html に `fetch` は無い。足すなら `.js` に書く）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { repoFiles } from "./repo-files.mjs";

/** `fetch` を呼んでよい、ただ 1 つの所。 */
const ALLOWED = { file: "public/app.js", line: /^\s*fetch\(path, \{ \.\.\.init, headers: /u };

// 注を消した、行の code の部分。ブロックの注は中身だけを消し（後ろの code は残す）、`*` で始まる行は注の続き。
const code = (line) =>
  /^\s*\*/u.test(line)
    ? ""
    : line
        .replace(/\/\*.*?\*\//gu, "")
        .replace(/\/\*.*$/u, "")
        .replace(/(^|\s)\/\/.*$/u, "");

/** `text` の中の、直に呼ぶ `fetch` の行（1 から数えた行の番号と、その行）。 */
export const bareFetches = (file, text) =>
  text
    .split("\n")
    .map((line, index) => ({ n: index + 1, line }))
    .filter(({ line }) => /\bfetch\b/u.test(code(line)))
    .filter(({ line }) => !(file === ALLOWED.file && ALLOWED.line.test(line)));

const main = () => {
  const files = repoFiles(process.cwd(), ["public"]).filter(
    (file) => file.endsWith(".js") && !file.startsWith("public/vendor/"),
  );
  const found = files.flatMap((file) =>
    bareFetches(file, readFileSync(file, "utf8")).map(({ n, line }) => `${file}:${String(n)}: ${line.trim()}`),
  );
  const allowed = readFileSync(ALLOWED.file, "utf8")
    .split("\n")
    .filter((line) => ALLOWED.line.test(line)).length;
  if (allowed !== 1) found.push(`${ALLOWED.file}: ask の中の fetch が ${String(allowed)} つ（1 つのはず）`);
  if (found.length > 0) {
    process.stderr.write(
      `check:ask: fetch を直に呼んでいます。画面の頼みは ask（public/app.js）を通します（言語を付けるため）:\n${found.join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`check:ask: ${String(files.length)} ファイルを見て、0 件\n`);
};

// 直に呼ばれた時だけ流す（試験は bareFetches を import する）。見分け方は check-i18n.mjs と同じ
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
