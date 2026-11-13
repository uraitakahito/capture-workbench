/**
 * 画面の文言（`public/i18n.js` と辞書）と、その見張り（`scripts/check-i18n.mjs`）。
 *
 * 見張りの試験は、**壊した見本を渡して赤になること**を見る —— 緑の見本だけでは、何も見ていない検査も通る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { IntlMessageFormat } from "../public/vendor/intl-messageformat.js";
import {
  chooseLang,
  dateTime,
  errorText,
  has,
  key,
  langOf,
  LANGS,
  phraseText,
  setLang,
  switchedUrl,
  t,
  timeOfDay,
  tNodes,
} from "../public/i18n.js";
import { stateOf, statsOf } from "../public/format.js";
import { jaLines, keysInHtml, keysInJs, problemsOf, readInput, stripComments, stripHtmlComments } from "../scripts/check-i18n.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dict = (lang) => JSON.parse(readFileSync(`${ROOT}public/i18n/${lang}.json`, "utf8"));

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

test("試験の言語は日本語に固定してある（流す機械の言語の設定に左右されない）", () => {
  assert.equal(langOf(), "ja");
  assert.deepEqual([...LANGS], ["ja", "en"]);
  assert.throws(() => setLang("fr"), /unknown language/);
  assert.equal(langOf(), "ja");
});

test("言語を選ぶ順: ?lang= → 覚えた選び → ブラウザの言語 → 英語", () => {
  // ?lang= は、覚えた選びにもブラウザの言語にも勝つ（その回だけ）
  assert.equal(chooseLang({ query: "ja", stored: "en", languages: ["en-US"] }), "ja");
  assert.equal(chooseLang({ query: "en", stored: "ja", languages: ["ja"] }), "en");
  // 覚えた選びは、ブラウザの言語に勝つ
  assert.equal(chooseLang({ stored: "ja", languages: ["en-US", "en"] }), "ja");
  assert.equal(chooseLang({ stored: "en", languages: ["ja"] }), "en");
  // ブラウザの言語は、並びで最初に当たる物。地域つき（ja-JP・en-GB）は頭で読む
  assert.equal(chooseLang({ languages: ["ja-JP", "en"] }), "ja");
  assert.equal(chooseLang({ languages: ["fr", "en"] }), "en");
  assert.equal(chooseLang({ languages: ["fr", "ja", "en"] }), "ja");
  assert.equal(chooseLang({ languages: ["EN-gb"] }), "en");
  // 英語でも日本語でもなければ英語。何も無くても英語
  assert.equal(chooseLang({ languages: ["de", "fr"] }), "en");
  assert.equal(chooseLang({}), "en");
  assert.equal(chooseLang(), "en");
  // 知らない値は、無いのと同じ
  assert.equal(chooseLang({ query: "fr", stored: "ja" }), "ja");
  assert.equal(chooseLang({ query: "", stored: "de", languages: ["ja"] }), "ja");
});

test("切り替えた後の URL: ?lang= を外す（残すと、覚えた選びより勝つ）。覚えられなければ ?lang= で運ぶ", () => {
  assert.equal(switchedUrl("http://127.0.0.1:7080/?lang=ja#start", "en", true), "http://127.0.0.1:7080/#start");
  assert.equal(switchedUrl("http://127.0.0.1:7080/#crawls", "en", true), "http://127.0.0.1:7080/#crawls");
  // ほかの query は残す
  assert.equal(switchedUrl("http://127.0.0.1:7080/?x=1&lang=ja", "en", true), "http://127.0.0.1:7080/?x=1");
  assert.equal(switchedUrl("http://127.0.0.1:7080/?lang=ja#search/a", "en", false), "http://127.0.0.1:7080/?lang=en#search/a");
});

test("届いたデータの句: 辞書に在れば訳し、無ければ届いた字のまま", () => {
  assert.equal(phraseText("crawls.reason", "closed from the schedules view"), "定期実行の画面から締めた");
  assert.equal(
    inEnglish(() => phraseText("crawls.reason", "closed from the schedules view")),
    "Closed from the schedules view",
  );
  // ほかのシステムの字と、辞書を足す前に保存された字は言い換えない
  assert.equal(phraseText("crawls.reason", "the flow failed without saying why"), "the flow failed without saying why");
  assert.equal(phraseText("crawls.reason", "定期実行の画面から締めた"), "定期実行の画面から締めた");
  assert.equal(phraseText("crawls.reason", null), null);
});

test("言語の名前は、どちらの画面でもその言語の字で出す", () => {
  for (const name of ["common.lang.ja", "common.lang.en"]) assert.equal(t(name), inEnglish(() => t(name)));
});

test("辞書の文は、2 つの言語とも全部 compile できる", () => {
  for (const lang of LANGS) {
    for (const [name, text] of Object.entries(dict(lang))) {
      assert.doesNotThrow(() => new IntlMessageFormat(text, lang), `${lang} ${name}`);
    }
  }
});

test("t: 鍵をいまの言語の文にし、値を埋める。辞書に無い鍵は鍵のまま返す", () => {
  assert.equal(t("crawls.state.running"), "走行中");
  assert.equal(t("archives.check.failed", { n: 3 }), "失敗 3");
  assert.equal(inEnglish(() => t("crawls.state.running")), "Running");
  assert.equal(t("no.such.key"), "no.such.key");
  assert.equal(has("crawls.state.running"), true);
  assert.equal(has("no.such.key"), false);
  assert.equal(key("crawls.state.running"), "crawls.state.running");
});

test("t: 値を渡し忘れると投げる（黙って空の字にしない）", () => {
  assert.throws(() => t("archives.check.failed"), /n/);
  assert.throws(() => inEnglish(() => t("crawls.state.withFailed", { state: "Completed" })), /n/);
});

test("数は桁を区切らずに埋める（区切るのは count() だけ）", () => {
  assert.equal(t("archives.check.warnings", { n: 12345 }), "警告 12345");
  assert.equal(inEnglish(() => t("archives.check.warnings", { n: 12345 })), "12345 warnings");
  assert.equal(inEnglish(() => t("archives.check.failed", { n: 1 })), "1 failure");
  assert.equal(inEnglish(() => t("archives.stats.records", { n: 12345 })), "WARC 12345 records");
});

test("英語の単数と複数", () => {
  const failed = (n) => stateOf({ state: "succeeded", stopReason: "completed", maxDepth: 2, pagesFailed: n }).text;
  assert.equal(failed(1), "完走・1 枚取れず");
  assert.equal(inEnglish(() => failed(1)), "Completed · 1 page failed");
  assert.equal(inEnglish(() => failed(2)), "Completed · 2 pages failed");
  assert.deepEqual(inEnglish(() => statsOf({ stats: { warcRecordCount: 1 } })), ["WARC 1 record"]);
  assert.deepEqual(inEnglish(() => statsOf({ stats: { warcRecordCount: 0 } })), ["WARC 0 records"]);
  assert.equal(
    inEnglish(() => t("common.pulse.status", { crawls: 1, archives: 2, time: "4:01:00 AM", seconds: 30 })),
    "1 crawl / 2 archives (as of 4:01:00 AM, every 30 seconds)",
  );
});

test("字として書いた波括弧と、英語の ' は、そのまま出る", () => {
  // {chrome} は埋め込みではなく、欄に書く字
  assert.deepEqual(
    tNodes("start.ua.hint", { code: (text) => `[${text}]` }).join("").slice(0, 10),
    "[{chrome}]",
  );
  const en = inEnglish(() => tNodes("start.ua.hint", { code: (text) => `[${text}]` }).join(""));
  assert.ok(en.startsWith("[{chrome}] is replaced with the browser's own string"), en);
  assert.ok(inEnglish(() => t("start.rules.pagesUnit")).includes("capture-ledger's default"));
});

test("tNodes: 要素が挟まる文を、字と要素の並びにする（生の HTML は差し込まない）", () => {
  const made = [];
  const nodes = tNodes("start.inline.readTypes", {
    code: (text) => {
      const node = { tag: "code", text };
      made.push(node);
      return node;
    },
  });
  assert.deepEqual(nodes, ["受け皿 ", { tag: "code", text: "__bh" }, " の型を読む"]);
  assert.equal(made.length, 1);
  // タグの無い文は、字 1 つの並び
  assert.deepEqual(tNodes("crawls.state.running"), ["走行中"]);
});

test("日時: 日本語はいままでと同じ字（月や日が 1 桁でも 0 を足さない）。英語は月の名前", () => {
  const at = new Date(2026, 0, 5, 4, 0, 0);
  assert.equal(dateTime(at), "2026/1/5 4:00:00");
  assert.equal(dateTime(at), at.toLocaleString("ja-JP"));
  assert.equal(timeOfDay(at), "4:00:00");
  assert.equal(inEnglish(() => dateTime(at)).replace(/ /gu, " "), "Jan 5, 2026, 4:00:00 AM");
  assert.equal(inEnglish(() => timeOfDay(at)).replace(/ /gu, " "), "4:00:00 AM");
});

test("誤りの文を読む順: server の句 → capture-ledger の句 → message → error。どれも無ければ undefined", () => {
  // capture-workbench の server の句は、値を埋めて訳す
  const unreachable = { error: "ledger unreachable", params: { url: "http://127.0.0.1:7070", cause: "fetch failed" } };
  assert.equal(
    errorText(unreachable),
    "http://127.0.0.1:7070 に届かない (fetch failed)。capture-ledger で pnpm run api は動いているか?",
  );
  assert.equal(
    inEnglish(() => errorText(unreachable)),
    "Cannot reach http://127.0.0.1:7070 (fetch failed). Is pnpm run api running in capture-ledger?",
  );
  assert.equal(errorText({ error: "body too large", params: { limit: 1048576 } }), "本文が 1048576 バイトを超えた");
  // 値の足りない句（古い server）は、投げずに句のまま
  assert.equal(errorText({ error: "body too large" }), "body too large");
  // capture-ledger の検査の答え（Fastify）は、中身が message に在る
  assert.equal(
    errorText({ statusCode: 400, error: "Bad Request", message: "body/seeds must be array" }),
    "body/seeds must be array",
  );
  // capture-ledger の句は、辞書に在れば訳す（細かい場面は test/ledger-text.test.mjs）。無ければ、届いた字のまま
  assert.equal(errorText({ error: "invalid cron", hint: "…" }), "cron の式を読めません");
  assert.equal(errorText({ error: "a phrase from a newer ledger" }), "a phrase from a newer ledger");
  assert.equal(errorText({}), undefined);
  assert.equal(errorText(undefined), undefined);
  assert.equal(errorText("text"), undefined);
});

test("見張りは、いまの repo では緑", async () => {
  assert.deepEqual(problemsOf(await readInput(ROOT)), []);
});

// ── 見張りが赤にする物（壊した見本）──────────────────────────────────
const sample = (over = {}) => ({
  IntlMessageFormat,
  dicts: {
    ja: { "a.one": "一 {n}", "workbench.error.json only": "JSON だけ" },
    en: { "a.one": "one {n}", "workbench.error.json only": "JSON only" },
  },
  scripts: { "public/x.js": 'export const f = (n) => t("a.one", { n });\n' },
  html: { "public/index.html": "<p></p>\n" },
  phrases: ["json only"],
  ...over,
});

test("見張り: 壊していない見本は緑", () => {
  assert.deepEqual(problemsOf(sample()), []);
});

test("見張り 1: 片方の辞書にしか無い鍵は、鍵を名指して赤", () => {
  const broken = sample();
  delete broken.dicts.en["a.one"];
  assert.deepEqual(problemsOf(broken), ["辞書 en に鍵が無い: a.one（ja には在る）"]);
  const extra = sample();
  extra.dicts.en["a.two"] = "two";
  assert.ok(problemsOf(extra).includes("辞書 ja に鍵が無い: a.two（en には在る）"));
});

test("見張り 2: 埋め込みの名前の食い違いと、読めない文は赤", () => {
  const renamed = sample();
  renamed.dicts.en["a.one"] = "one {m}";
  assert.deepEqual(problemsOf(renamed), ["埋め込みの名前が食い違う: a.one（ja: n／en: m）"]);
  const unclosed = sample();
  unclosed.dicts.en["a.one"] = "one {n";
  assert.match(problemsOf(unclosed)[0], /^辞書 en の文を読めない: a\.one/);
  // 複数形の枝の中の名前と、タグの名前も数える
  const plural = sample();
  plural.dicts.en["a.one"] = "{n, plural, one {{n} thing} other {{n} things}}";
  assert.deepEqual(problemsOf(plural), []);
  const tagged = sample();
  tagged.dicts.en["a.one"] = "<code>one</code> {n}";
  assert.deepEqual(problemsOf(tagged), ["埋め込みの名前が食い違う: a.one（ja: n／en: code, n）"]);
});

test("見張り 3: 辞書に無い鍵・使っていない鍵・組み立てた鍵・server の句との食い違いは赤", () => {
  const missing = sample({ scripts: { "public/x.js": 't("a.one", { n: 1 });\nt("a.none");\n' } });
  assert.deepEqual(problemsOf(missing), ["辞書に無い鍵: a.none（public/x.js:2）"]);
  const unused = sample({ scripts: { "public/x.js": "export const f = 1;\n" } });
  assert.deepEqual(problemsOf(unused), ["どこも使っていない鍵: a.one"]);
  const built = sample({ scripts: { "public/x.js": 't("a.one", { n: 1 });\nconst g = (k) => t(`a.${k}`);\n' } });
  assert.deepEqual(problemsOf(built), ["鍵を組み立てている: t(…) の最初の引数が文字列でない（public/x.js:2）"]);
  // HTML が名指す鍵も照らす
  const html = sample({ html: { "public/index.html": '<p data-i18n="a.one"></p>\n<input data-i18n-placeholder="a.none" />\n' } });
  assert.deepEqual(problemsOf(html), ["辞書に無い鍵: a.none（public/index.html:2）"]);
  // server の句: 辞書に文が無い・一覧に無い句の文が辞書に在る
  assert.ok(problemsOf(sample({ phrases: ["json only", "new phrase"] })).includes("辞書に無い鍵: workbench.error.new phrase（server の句）"));
  assert.deepEqual(problemsOf(sample({ phrases: [] })), ["server の句の一覧に無い鍵: workbench.error.json only"]);
  // capture-ledger の答えから来る鍵は、コードが名指さなくてよい
  const ledger = sample();
  for (const lang of ["ja", "en"]) ledger.dicts[lang]["ledger.error.invalid cron"] = "cron";
  assert.deepEqual(problemsOf(ledger), []);
});

test("見張り 4: コメントの外の日本語は、1 行でも赤", () => {
  const direct = sample({ scripts: { "public/x.js": 't("a.one", { n: 1 });\n// コメントは見ない\nconst s = "直書き";\n' } });
  assert.match(problemsOf(direct)[0], /^直書きの日本語: 1 行（public\/x\.js:3）/);
  // 全角の句読点だけの文字列も
  const punct = sample({ scripts: { "public/x.js": 't("a.one", { n: 1 });\nconst sep = "、";\n' } });
  assert.match(problemsOf(punct)[0], /^直書きの日本語: 1 行（public\/x\.js:2）/);
  const html = sample({ html: { "public/index.html": "<!-- コメントは見ない -->\n<p>字</p>\n" } });
  assert.match(problemsOf(html)[0], /^直書きの日本語: 1 行（public\/index\.html:2）/);
  // 何行でも、ファイルごとに 1 件で言う
  const two = 't("a.one", { n: 1 });\nconst a = "一";\nconst b = "二";\n';
  assert.match(problemsOf(sample({ scripts: { "public/x.js": two } }))[0], /^直書きの日本語: 2 行（public\/x\.js:2 public\/x\.js:3）/);
});

test("走査: コメントだけを空白にし、文字列・雛形・正規表現の中は残す", () => {
  const ja = (src) => jaLines(stripComments(src));
  assert.deepEqual(ja('const a = "字"; // 注記\n/* 注記 */ const b = 1;\n'), [1]);
  assert.deepEqual(ja("const a = `${b} 字 ${`入れ子 ${c}`}`; // 注記\n"), [1]);
  // 文字列の中の // と /* は、コメントではない
  assert.deepEqual(ja('const url = "http://x/"; const s = "字";\n'), [1]);
  // 正規表現の中の引用符を、文字列の始まりと読まない（読むと、後ろの行のコメントが文字列に見える）
  assert.deepEqual(ja('const f = (s) => {\n  return /"/.test(s);\n};\n// 注記\nconst s = "字";\n'), [5]);
  assert.deepEqual(ja("if (a) {\n}\n/[\"']/.test(s);\n// 注記\nconst s = '字';\n"), [5]);
  assert.deepEqual(ja('const ok = /^\\d+ \\/ "/u.test(s); // 注記\nconst s = "字";\n'), [2]);
  // 割り算は正規表現ではない
  assert.deepEqual(ja('const half = (a + b) / 2; // 注記 "\nconst s = "字"; // 注記\nconst r = x / y / z; // 注記\n'), [2]);
  // 長さは変えない（行の番号がずれない）
  const src = 'a; // 注記\n/* 二行の\n   注記 */ b;\n';
  assert.equal(stripComments(src).length, src.length);
  assert.equal(stripHtmlComments("<!-- 注記\n 注記 --><p>字</p>").split("\n").length, 2);
});

test("走査: 名指した鍵を、行つきで拾う", () => {
  const code = 'const a = t("a.one");\nel.append(...tNodes("a.two", { code }));\nconst MAP = { x: key("a.three") };\nif (has("a.four")) g();\nlist.sort(t);\n';
  assert.deepEqual(keysInJs(code).keys, [
    { key: "a.one", line: 1 },
    { key: "a.two", line: 2 },
    { key: "a.three", line: 3 },
    { key: "a.four", line: 4 },
  ]);
  // 名前の一部が t なだけの呼び出し（format( など）と、method の .t( は数えない
  assert.deepEqual(keysInJs('format("x"); o.t("y"); split("z");').keys, []);
  assert.deepEqual(keysInHtml('<p data-i18n="a.one"></p><input data-i18n-placeholder="a.two" data-i18n-aria-label="a.three" />'), [
    { key: "a.one", line: 1 },
    { key: "a.two", line: 1 },
    { key: "a.three", line: 1 },
  ]);
});
