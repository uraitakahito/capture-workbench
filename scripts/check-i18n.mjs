/**
 * 画面の文言の見張り。`npm run check` の中で走る（`npm run check:i18n`）。install は要らない ——
 * 使うのは node の標準と、commit してある束（`public/vendor/intl-messageformat.js`）だけ。
 *
 * 画面の字は、書く所（`public/*.js`・`public/index.html`）には鍵だけを置き、文は言語ごとの辞書
 * （`public/i18n/ja.json`・`en.json`）に置く。見張らなければ、直書きは戻ってくる。見るのは 4 つ:
 *
 *   1. **2 つの辞書の鍵が同じ。** 片方にしか無い鍵は、その言語の画面に鍵の名前がそのまま出る
 *   2. **鍵ごとに、埋め込みの名前が同じ。** `{n}` と `{m}` の食い違いは、片方の言語でだけ値の渡し忘れになる。
 *      文として読めない文（括弧の閉じ忘れなど）も、ここで言う
 *   3. **コードと HTML が名指す鍵が辞書に在り、辞書の鍵はどこかで使われている。** 鍵は文字列をそのまま書く
 *      （`t("crawls.state.running")`）。組み立てた鍵は照らせないので、`t()`・`tNodes()`・`key()` の最初の引数が
 *      文字列でなければ赤。`workbench.error.*` は server の句の一覧（`src/lib.mjs` の `ERROR_PHRASES`）と両方向で
 *      照らす。`ledger.*` は capture-ledger の答えから来る鍵なので、「使われているか」からは外す
 *   4. **`public/` の JS と `index.html` の、コメントの外に日本語の字が無い**（全角の句読点も）。1 行でも在れば赤
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 日本語の字。かな・漢字と、全角の記号と句読点（、。「」（）・／ など）。 */
const JA = /[　-〿぀-ヿ㐀-鿿＀-￯]/u;

/** この語の直後の `/` は、割り算ではなく正規表現の始まり。 */
const BEFORE_REGEX = new Set([
  "return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "instanceof", "yield", "await",
]);

/** `i` から始まる正規表現の終わり（閉じる `/` の次の位置）。同じ行で閉じなければ undefined。 */
const regexEnd = (src, i) => {
  let j = i + 1;
  let inClass = false;
  for (; j < src.length; j += 1) {
    const c = src[j];
    if (c === "\n") return undefined;
    if (c === "\\") j += 1;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return j + 1;
  }
  return undefined;
};

/**
 * JS のコメントを、同じ長さの空白にする（行の番号は動かない）。文字列・雛形（`${}` の入れ子）・正規表現は
 * そのまま残す。
 *
 * `/` が正規表現か割り算かは、直前の語で決める: 値（名前・数・閉じ括弧）の後なら割り算。ただし `return` のような
 * 語の後は正規表現。`)` と `}` の後はどちらもありうるので、同じ行で閉じて、その後ろが式の続き（`.`・`,`・`;`・
 * 閉じ括弧・行末）のときだけ正規表現と読む —— `return /"/.test(s);` や、ブロックの `}` の次の行の正規表現を、
 * 文字列の始まりと読み違えないため。
 */
export const stripComments = (src) => {
  let out = "";
  let i = 0;
  const stack = []; // 雛形の ${ の中の、波括弧の深さ
  let prev = ""; // 直前の、空白でない字
  let word = ""; // 直前の語（名前か予約語）。記号を挟むと空になる
  const blank = (s) => s.replace(/[^\n]/gu, " ");
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      prev = c;
      word = "";
    } else if (c === "`" || (c === "}" && stack.length > 0 && stack.at(-1) === 0)) {
      // 雛形の字の部分を、次の ${ か ` まで読む
      if (c === "}") stack.pop();
      let j = i + 1;
      while (j < src.length && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
      if (src[j] === "`") {
        out += src.slice(i, j + 1);
        i = j + 1;
        prev = "`";
      } else {
        out += src.slice(i, j + 2);
        i = j + 2;
        stack.push(0);
        prev = "{";
      }
      word = "";
    } else if (c === "/") {
      const end = regexEnd(src, i);
      const afterValue = /[\w$)\]}"'`]/u.test(prev) && !BEFORE_REGEX.has(word);
      const closesExpression =
        end !== undefined && /^[dgimsuvy]*\s*(?:[.,;)\]}]|$)/mu.test(src.slice(end, end + 12).split("\n")[0]);
      const isRegex = end !== undefined && (!afterValue || ((prev === ")" || prev === "}") && closesExpression));
      if (isRegex) {
        out += src.slice(i, end);
        i = end;
        prev = "/";
      } else {
        out += c;
        i += 1;
        prev = c;
      }
      word = "";
    } else {
      if (stack.length > 0) {
        if (c === "{") stack[stack.length - 1] += 1;
        else if (c === "}") stack[stack.length - 1] -= 1;
      }
      out += c;
      if (/[\w$]/u.test(c)) word = i > 0 && /[\w$]/u.test(src[i - 1]) ? word + c : c;
      else if (!/\s/u.test(c)) word = "";
      if (!/\s/u.test(c)) prev = c;
      i += 1;
    }
  }
  return out;
};

/** HTML のコメントを、同じ長さの空白にする。 */
export const stripHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/gu, (m) => m.replace(/[^\n]/gu, " "));

/** 日本語の字が在る行の番号（1 から）。 */
export const jaLines = (text) => text.split("\n").flatMap((line, n) => (JA.test(line) ? [n + 1] : []));

/**
 * JS（コメントを落とした物）が名指す鍵と、鍵を組み立てている所。見るのは `t(`・`tNodes(`・`key(`・`has(` の
 * 最初の引数。`has` は、届いた句を引く所で組み立てるので（`i18n.js` の `errorText`）、文字列のときだけ数える。
 */
export const keysInJs = (code) => {
  const keys = [];
  const built = [];
  // 名前の一部（format( など）と method（o.t(）は数えない。展開の ...tNodes( は数える
  const call = /(?<![\w$]|(?<!\.\.)\.)(t|tNodes|key|has)\(\s*(?:"((?:[^"\\\n]|\\.)*)"\s*[,)]|(.))/gu;
  for (const m of code.matchAll(call)) {
    const line = code.slice(0, m.index).split("\n").length;
    if (m[2] !== undefined) keys.push({ key: m[2], line });
    else if (m[1] !== "has") built.push({ call: m[1], line });
  }
  return { keys, built };
};

/** HTML（コメントを落とした物）が名指す鍵。`data-i18n` と `data-i18n-<属性>`。 */
export const keysInHtml = (html) =>
  [...html.matchAll(/\sdata-i18n(?:-[a-z-]+)?="([^"]*)"/gu)].map((m) => ({
    key: m[1],
    line: html.slice(0, m.index).split("\n").length,
  }));

/** 文（ICU MessageFormat）の埋め込みの名前。タグの名前（`<code>`）も入る。読めない文は投げる。 */
export const argsOf = (IntlMessageFormat, text) => {
  const names = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (typeof node.value === "string" && node.type !== 0 && node.type !== 7) names.add(node.value);
      if (node.options !== undefined) for (const option of Object.values(node.options)) walk(option.value);
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(new IntlMessageFormat(text, "en").getAst());
  return names;
};

/**
 * 4 つの検査。`input` は辞書・JS と HTML の中身・server の句の一覧。返すのは、赤にする理由の並び
 * （空なら緑）。ファイルを読む所と分けてあるのは、試験が壊した見本を渡して、赤になることを確かめるため。
 *
 * @param {{
 *   IntlMessageFormat: unknown,
 *   dicts: Record<string, Record<string, string>>,
 *   scripts: Record<string, string>,
 *   html: Record<string, string>,
 *   phrases: readonly string[],
 * }} input
 */
export const problemsOf = ({ IntlMessageFormat, dicts, scripts, html, phrases }) => {
  const out = [];
  const langs = Object.keys(dicts);
  const [first, ...rest] = langs;

  // 1. 鍵の集合
  for (const lang of rest) {
    for (const key of Object.keys(dicts[first])) {
      if (!Object.hasOwn(dicts[lang], key)) out.push(`辞書 ${lang} に鍵が無い: ${key}（${first} には在る）`);
    }
    for (const key of Object.keys(dicts[lang])) {
      if (!Object.hasOwn(dicts[first], key)) out.push(`辞書 ${first} に鍵が無い: ${key}（${lang} には在る）`);
    }
  }

  // 2. 埋め込みの名前
  const args = {};
  for (const lang of langs) {
    args[lang] = {};
    for (const [key, text] of Object.entries(dicts[lang])) {
      try {
        args[lang][key] = argsOf(IntlMessageFormat, text);
      } catch (err) {
        out.push(`辞書 ${lang} の文を読めない: ${key}（${err instanceof Error ? err.message : String(err)}）`);
      }
    }
  }
  for (const lang of rest) {
    for (const [key, names] of Object.entries(args[first])) {
      const other = args[lang][key];
      if (other === undefined) continue;
      const a = [...names].sort().join(", ");
      const b = [...other].sort().join(", ");
      if (a !== b) out.push(`埋め込みの名前が食い違う: ${key}（${first}: ${a || "なし"}／${lang}: ${b || "なし"}）`);
    }
  }

  // 3. 名指す鍵と辞書
  const used = new Set();
  for (const [file, src] of Object.entries(scripts)) {
    const { keys, built } = keysInJs(stripComments(src));
    for (const { key, line } of keys) {
      used.add(key);
      if (!Object.hasOwn(dicts[first], key)) out.push(`辞書に無い鍵: ${key}（${file}:${String(line)}）`);
    }
    // i18n.js は、受け取った鍵をそのまま引く側（t の定義と、HTML の鍵を入れる所）
    if (!file.endsWith("/i18n.js")) {
      for (const { call, line } of built) {
        out.push(`鍵を組み立てている: ${call}(…) の最初の引数が文字列でない（${file}:${String(line)}）`);
      }
    }
  }
  for (const [file, src] of Object.entries(html)) {
    for (const { key, line } of keysInHtml(stripHtmlComments(src))) {
      used.add(key);
      if (!Object.hasOwn(dicts[first], key)) out.push(`辞書に無い鍵: ${key}（${file}:${String(line)}）`);
    }
  }
  const PHRASE = "workbench.error.";
  for (const phrase of phrases) {
    used.add(PHRASE + phrase);
    if (!Object.hasOwn(dicts[first], PHRASE + phrase)) out.push(`辞書に無い鍵: ${PHRASE}${phrase}（server の句）`);
  }
  for (const key of Object.keys(dicts[first])) {
    if (key.startsWith("ledger.")) continue;
    if (key.startsWith(PHRASE) && !phrases.includes(key.slice(PHRASE.length))) {
      out.push(`server の句の一覧に無い鍵: ${key}`);
    } else if (!used.has(key)) {
      out.push(`どこも使っていない鍵: ${key}`);
    }
  }

  // 4. 直書き
  const counts = {};
  for (const [file, src] of Object.entries(scripts)) counts[file] = jaLines(stripComments(src));
  for (const [file, src] of Object.entries(html)) counts[file] = jaLines(stripHtmlComments(src));
  for (const [file, lines] of Object.entries(counts)) {
    if (lines.length === 0) continue;
    const where = lines.slice(0, 5).map((n) => `${file}:${String(n)}`).join(" ");
    out.push(`直書きの日本語: ${String(lines.length)} 行（${where}${lines.length > 5 ? " …" : ""}）。字は辞書に置き、鍵で引く`);
  }
  return out;
};

/** repo から読んで、検査に渡す形にする。 */
export const readInput = async (root) => {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const { IntlMessageFormat } = await import(pathToFileURL(join(root, "public/vendor/intl-messageformat.js")).href);
  const { ERROR_PHRASES } = await import(pathToFileURL(join(root, "src/lib.mjs")).href);
  const scripts = Object.fromEntries(
    readdirSync(join(root, "public"))
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map((name) => [`public/${name}`, read(`public/${name}`)]),
  );
  return {
    IntlMessageFormat,
    dicts: { ja: JSON.parse(read("public/i18n/ja.json")), en: JSON.parse(read("public/i18n/en.json")) },
    scripts,
    html: { "public/index.html": read("public/index.html") },
    phrases: ERROR_PHRASES,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const input = await readInput(root);
  const problems = problemsOf(input);
  for (const problem of problems) console.error(problem);
  const keys = Object.keys(input.dicts.ja).length;
  console.log(
    `check:i18n: 辞書 ${String(keys)} 鍵 × ${String(Object.keys(input.dicts).length)} 言語、${String(problems.length)} 件`,
  );
  if (problems.length > 0) process.exit(1);
}
