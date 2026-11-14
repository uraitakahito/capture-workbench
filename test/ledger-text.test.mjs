/**
 * capture-ledger の断りの文を、画面の辞書で訳す（CAPTURE-294 の段 6）。`public/i18n.js` の `errorText`・`hintText`・
 * `hintsText`・`refusalTexts` と、辞書の `ledger.error.*`・`ledger.hint.*`・`ledger.list.*`。
 *
 * 約束は 2 つ:
 *
 *   - **日本語の画面は、capture-ledger の文と同じ字を出す。** capture-ledger は人に見せる日本語の文（`hint`）に並べて、
 *     文ごとの鍵と値の組（`hints`）を返す。日本語の辞書の文は、値を埋めると capture-ledger の文（`text`）と 1 字も違わない
 *   - **鍵の一覧は capture-ledger との約束。** 辞書の `ledger.hint.*` は、代役に置いた写し（`sandbox/fake-ledger.mjs` の
 *     `HINT_KEYS`。capture-ledger の `src/types/hint.ts` と同じ中身）と両方向で一致する
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATUS_CODES } from "node:http";

import { IntlMessageFormat } from "../public/vendor/intl-messageformat.js";
import { errorText, hintsText, hintText, refusalTexts, setLang, t } from "../public/i18n.js";
import { changesError } from "../public/changes.js";
import { diagnosisOf, fixAnswer } from "../public/fix.js";
import { actionAnswer, createAnswer } from "../public/schedules.js";
import { inlineDeclared, startAnswer } from "../public/start.js";
import { ERROR_PHRASES } from "../src/lib.mjs";
import { argsOf } from "../scripts/check-i18n.mjs";
import { catalogOf, createSchedule, HINT_KEYS, submitCrawl } from "../sandbox/fake-ledger.mjs";

const dict = (lang) => JSON.parse(readFileSync(new URL(`../public/i18n/${lang}.json`, import.meta.url), "utf8"));
const DICTS = { ja: dict("ja"), en: dict("en") };
const scenario = JSON.parse(readFileSync(new URL("../sandbox/scenario.json", import.meta.url), "utf8"));

/** 英語で 1 つ試し、終わりに日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

/** かな・漢字と全角の記号。英語の文に 1 字でも在れば、訳せていない。 */
const JA = /[　-〿぀-ヿ㐀-鿿＀-￯]/u;

/** 辞書の鍵のうち、頭が `prefix` の物の、後ろの部分。 */
const under = (lang, prefix) =>
  Object.keys(DICTS[lang])
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));

/**
 * 鍵ごとの見本。**capture-ledger の `test/hints.test.ts` の `CASES` と同じ入力で、本物の関数（`readParams`・
 * `checkValues`・`formatsRefusal`・`applyEdits`・`refusalOf`）に断らせて取り出した組**（CAPTURE-294 の段 5。枝
 * `feat/c294-hint-keys` の commit `736a6f7`）。`params` は `hints.test.ts` の `CASES` の `params` と同じ値で、
 * `text` は capture-ledger が返す字そのまま —— 手で書き直さない（文を直すのは capture-ledger の側。直ったら、ここと
 * 日本語の辞書を同じ字にする）。
 */
const SAMPLES = [
  { key: "params.notArray", text: "params は宣言の配列" },
  { key: "params.tooMany", params: { max: 32 }, text: "params は 32 個まで" },
  { key: "params.entryNotObject", text: "params の要素は { name, kind, required?, summary } の object" },
  { key: "params.invalidName", params: { name: "\"Bad-Name\"", max: 64 }, text: "params の name \"Bad-Name\" は ^[a-z][a-z0-9_]*$ で 64 字まで" },
  { key: "params.invalidKind", params: { name: "token", kind: "cookie" }, text: "params の token の kind は variable か secret (いまは cookie)" },
  { key: "params.requiredNotBoolean", params: { name: "token" }, text: "params の token の required は true か false (省けば false)" },
  { key: "params.summaryNotString", params: { name: "token" }, text: "params の token の summary は文字列" },
  { key: "params.summaryEmpty", params: { name: "token" }, text: "params の token の summary が空 —— 一覧で何の値か分からなくなる" },
  { key: "params.unknownKeys", params: { name: "token", keys: ["default", "pattern"] }, text: "params の token に知らない鍵: default, pattern" },
  { key: "params.duplicateName", params: { name: "token" }, text: "params に token が 2 度ある" },
  { key: "params.schemaOnlyForVariable", params: { name: "token" }, text: "params の token に schema を書けるのは kind: variable だけ" },
  { key: "params.archiveOnlyForSecret", params: { name: "query" }, text: "params の query に archive を書けるのは kind: secret だけ" },
  {
    key: "params.invalidArchive",
    params: { name: "token", value: "\"hide\"" },
    text: "params の token の archive は \"keep\" だけ (省けば WARC から隠す。いまは \"hide\")",
  },
  { key: "params.schemaMissing", params: { name: "query" }, text: "params の query の schema が無い (kind: variable は値の形を持つ)" },
  {
    key: "params.schemaUnknownKeys",
    params: { name: "query", keys: ["pattern", "format"] },
    text: "params の query の schema に知らない鍵: pattern, format",
  },
  { key: "params.schemaTypeNotString", params: { name: "query" }, text: "params の query の schema の type は string だけ" },
  { key: "params.schemaInvalidLength", params: { name: "query" }, text: "params の query の minLength と maxLength は 0 以上の整数" },
  { key: "params.schemaInvalidEnum", params: { name: "query" }, text: "params の query の enum は文字列の列" },
  { key: "variables.notInEnum", params: { name: "lang", values: ["ja", "en"] }, text: "lang は ja・en のどれか" },
  { key: "variables.tooShort", params: { name: "lang", min: 7 }, text: "lang は 7 字以上" },
  { key: "variables.tooLong", params: { name: "lang", max: 3 }, text: "lang は 3 字まで" },
  {
    key: "formats.cannotHideSecrets",
    params: { formats: ["png", "html"] },
    text: "CAPTURE_LEDGER_CAPTURE_FORMATS の png・html は値を置き換えられない (BrowserHive が断る)。形式から外すか、値を BrowserHive WARC に残すなら宣言に archive: \"keep\" と書く",
  },
  { key: "inlineParams.secretsOnly", text: "params に書けるのはシークレットだけ。変数は source の defineParams で宣言する" },
  { key: "fix.noEdits", text: "置き換えが 1 つも無い" },
  { key: "fix.invalidRange", params: { from: 3, to: 2 }, text: "置き換えの範囲が読めない (3〜2)" },
  { key: "fix.outOfRange", params: { line: 9, lines: 8 }, text: "置き換えが source の外 (9 行目。source は 8 行)" },
  { key: "fix.overlappingEdits", params: { firstFrom: 2, firstTo: 5, secondFrom: 4, secondTo: 7 }, text: "置き換えが重なっている (2〜5 と 4〜7)" },
  { key: "fix.suppressedCheck", text: "型の検査を外す注記を足した" },
  { key: "fix.usedAny", text: "any で型の誤りを黙らせた" },
  { key: "fix.addedModuleSyntax", text: "import か export を足した (module になり、BrowserHive では走らない)" },
  { key: "fix.tooManyLines", params: { lines: 6, max: 5 }, text: "書き換えた行が多すぎる (6 行。上限は 5 行)" },
  { key: "fix.unreadableAnswer", text: "答えが決めた形 (edits と notes) で読めなかった。" },
];

// ── 鍵の一覧 ─────────────────────────────────────────────────────────

test("辞書の ledger.hint.* は、代役に置いた capture-ledger の鍵の一覧（HINT_KEYS）と両方向で一致する", () => {
  const expected = Object.keys(HINT_KEYS).sort();
  // 片方にだけ足す・消すと、ここで鍵を名指して赤になる
  for (const lang of ["ja", "en"]) assert.deepEqual(under(lang, "ledger.hint.").sort(), expected, `辞書 ${lang}`);
});

test("辞書の文が埋める値の名前は、鍵の一覧の値の名前とちょうど同じ", () => {
  for (const lang of ["ja", "en"]) {
    for (const [key, names] of Object.entries(HINT_KEYS)) {
      const used = [...argsOf(IntlMessageFormat, DICTS[lang][`ledger.hint.${key}`])].sort();
      assert.deepEqual(used, [...names].sort(), `${lang} ${key}`);
    }
  }
});

test("見本は、鍵の一覧の鍵を 1 つずつ全部持ち、値の名前も一覧のとおり", () => {
  assert.deepEqual(SAMPLES.map((sample) => sample.key).sort(), Object.keys(HINT_KEYS).sort());
  for (const sample of SAMPLES) {
    assert.deepEqual(Object.keys(sample.params ?? {}).sort(), [...HINT_KEYS[sample.key]].sort(), sample.key);
    // 値を埋めない文は、欄ごと無い
    if (HINT_KEYS[sample.key].length === 0) assert.equal("params" in sample, false, sample.key);
  }
});

// ── 文 1 つ（hintText）───────────────────────────────────────────────

for (const sample of SAMPLES) {
  test(`${sample.key}: 日本語は capture-ledger の文と同じ字、英語は値を全部含み日本語の字を含まない`, () => {
    assert.equal(hintText(sample), sample.text);
    // 辞書を引いて組んだ字で、届いた text を返しただけではないこと
    assert.equal(hintText({ ...sample, text: "×" }), sample.text);
    const english = inEnglish(() => hintText(sample));
    assert.doesNotMatch(english, JA);
    for (const value of Object.values(sample.params ?? {})) {
      for (const part of Array.isArray(value) ? value : [value]) assert.ok(english.includes(String(part)), `${english} に ${String(part)}`);
    }
  });
}

test("並びの値は、値の名前で決めた区切りで繋ぐ: values・formats は「・」（英語は「, 」）、ほかは「, 」", () => {
  const oneOf = { key: "variables.notInEnum", params: { name: "lang", values: ["ja", "en", "fr"] }, text: "×" };
  assert.equal(hintText(oneOf), "lang は ja・en・fr のどれか");
  assert.equal(inEnglish(() => hintText(oneOf)), "lang must be one of ja, en, fr");
  const formats = { key: "formats.cannotHideSecrets", params: { formats: ["png", "webp"] }, text: "×" };
  assert.match(hintText(formats), /^CAPTURE_LEDGER_CAPTURE_FORMATS の png・webp は/);
  assert.match(inEnglish(() => hintText(formats)), /^png, webp in CAPTURE_LEDGER_CAPTURE_FORMATS cannot/);
  const keys = { key: "params.unknownKeys", params: { name: "token", keys: ["default", "pattern"] }, text: "×" };
  assert.equal(hintText(keys), "params の token に知らない鍵: default, pattern");
  assert.equal(inEnglish(() => hintText(keys)), "Unknown keys on token in params: default, pattern");
});

test("英語の数は、1 と 2 で単数と複数を分ける", () => {
  const atLeast = (min) => inEnglish(() => hintText({ key: "variables.tooShort", params: { name: "word", min }, text: "×" }));
  assert.equal(atLeast(1), "word must be at least 1 character");
  assert.equal(atLeast(2), "word must be at least 2 characters");
  const lines = (n) => inEnglish(() => hintText({ key: "fix.outOfRange", params: { line: 9, lines: n }, text: "×" }));
  assert.equal(lines(1), "A replacement is outside the source (line 9; the source has 1 line)");
  assert.equal(lines(8), "A replacement is outside the source (line 9; the source has 8 lines)");
  // 桁は区切らない（capture-ledger の文と同じ字）
  assert.equal(
    hintText({ key: "fix.tooManyLines", params: { lines: 1234, max: 1000 }, text: "×" }),
    "書き換えた行が多すぎる (1234 行。上限は 1000 行)",
  );
});

test("訳せない組は、届いた文（text）のまま: 知らない鍵・鍵の無い組・値が足りない組・値の形が違う組", () => {
  for (const said of [hintText, (hint) => inEnglish(() => hintText(hint))]) {
    // この workbench より新しい capture-ledger が足した鍵
    assert.equal(said({ key: "params.somethingNew", params: { name: "q" }, text: "params の q が新しい理由で読めない" }), "params の q が新しい理由で読めない");
    // 命令の例のように、訳す物でない文
    assert.equal(said({ text: "wmill variable add <value> f/waggle_secrets/nope --secret" }), "wmill variable add <value> f/waggle_secrets/nope --secret");
    // 値が足りない（params の欄が無い・名前が違う）
    assert.equal(said({ key: "params.tooMany", text: "params は 32 個まで" }), "params は 32 個まで");
    assert.equal(said({ key: "params.tooMany", params: { limit: 32 }, text: "params は 32 個まで" }), "params は 32 個まで");
    // 値の形が違う（決まりは string・number・string[]）
    assert.equal(said({ key: "params.tooMany", params: { max: null }, text: "params は 32 個まで" }), "params は 32 個まで");
    assert.equal(said({ key: "params.tooMany", params: { max: { n: 32 } }, text: "params は 32 個まで" }), "params は 32 個まで");
    assert.equal(said({ key: "params.unknownKeys", params: { name: "q", keys: [1, 2] }, text: "params の q に知らない鍵: 1, 2" }), "params の q に知らない鍵: 1, 2");
  }
  // 文の無い組・組でない物は undefined
  assert.equal(hintText({ key: "params.somethingNew" }), undefined);
  assert.equal(hintText({}), undefined);
  assert.equal(hintText(null), undefined);
  assert.equal(hintText("text"), undefined);
});

// ── 答えの hint（hintsText）─────────────────────────────────────────

const MISFITS = {
  error: "invalid variables",
  names: ["code", "level"],
  hint: "code は 2 字まで / level は low・high のどれか",
  hints: [
    { key: "variables.tooLong", params: { name: "code", max: 2 }, text: "code は 2 字まで" },
    { key: "variables.notInEnum", params: { name: "level", values: ["low", "high"] }, text: "level は low・high のどれか" },
  ],
};

test("hints の在る答えは、文ごとに訳して「 / 」で繋ぐ。日本語は hint と同じ字", () => {
  assert.equal(hintsText(MISFITS), MISFITS.hint);
  assert.equal(inEnglish(() => hintsText(MISFITS)), "code must be at most 2 characters / level must be one of low, high");
  // 辞書を引いて組んだ字で、hint を返しただけではないこと
  assert.equal(hintsText({ ...MISFITS, hint: "×" }), "code は 2 字まで / level は low・high のどれか");
  // 訳せる組と訳せない組が混ざれば、訳せない組は届いた文のまま
  const mixed = { hints: [MISFITS.hints[0], { key: "variables.somethingNew", text: "level が新しい理由で合わない" }] };
  assert.equal(inEnglish(() => hintsText(mixed)), "code must be at most 2 characters / level が新しい理由で合わない");
});

test("hints の無い古い capture-ledger の答えは hint のまま。どちらも無ければ undefined", () => {
  const old = { error: "invalid variables", names: ["code"], hint: "code は 2 字まで" };
  assert.equal(hintsText(old), "code は 2 字まで");
  assert.equal(inEnglish(() => hintsText(old)), "code は 2 字まで");
  assert.equal(hintsText({ error: "unknown script ids", ids: ["gone"] }), undefined);
  assert.equal(hintsText({ hints: [] }), undefined);
  assert.equal(hintsText({ hint: 1, hints: "x" }), undefined);
  assert.equal(hintsText(undefined), undefined);
  assert.equal(hintsText("text"), undefined);
});

test("鍵の無い組だけの答えは、hint をそのまま出す —— capture-ledger は終わりの案内を空白 1 つで繋ぐので、組から繋ぎ直さない", () => {
  const empty = {
    error: "no default scripts for these seeds",
    hint: "egov-law-search: laws.e-gov.go.jp (run nothing on purpose: send scripts: [])",
    hints: [{ text: "egov-law-search: laws.e-gov.go.jp" }, { text: "(run nothing on purpose: send scripts: [])" }],
  };
  assert.equal(hintsText(empty), empty.hint);
  assert.equal(inEnglish(() => hintsText(empty)), empty.hint);
  // hint の無い答え（組だけ）なら、組の文を繋ぐ
  assert.equal(hintsText({ hints: [{ text: "a: x" }, { text: "b: y" }] }), "a: x / b: y");
});

// ── 直し方の案を断った理由（refusalTexts）───────────────────────────

test("refusalHints が在れば組ごとに訳し、無ければ refusals のまま。どちらも無ければ空", () => {
  const failed = {
    error: "no fix passed the checks",
    refusals: ["any で型の誤りを黙らせた", "書き換えた行が多すぎる (6 行。上限は 5 行)"],
    refusalHints: [
      { key: "fix.usedAny", text: "any で型の誤りを黙らせた" },
      { key: "fix.tooManyLines", params: { lines: 6, max: 5 }, text: "書き換えた行が多すぎる (6 行。上限は 5 行)" },
    ],
  };
  assert.deepEqual(refusalTexts(failed), failed.refusals);
  assert.deepEqual(inEnglish(() => refusalTexts(failed)), [
    "It silenced the type errors with any",
    "It rewrote too many lines (6 lines; the limit is 5 lines)",
  ]);
  // 古い capture-ledger（refusals だけ）
  const old = { error: "no fix passed the checks", refusals: failed.refusals };
  assert.deepEqual(refusalTexts(old), failed.refusals);
  assert.deepEqual(inEnglish(() => refusalTexts(old)), failed.refusals);
  // 文の無い組は、同じ並びの refusals の文で埋める
  assert.deepEqual(refusalTexts({ refusals: ["一つ目", "二つ目"], refusalHints: [{ key: "fix.somethingNew" }, { text: "二つ目" }] }), ["一つ目", "二つ目"]);
  assert.deepEqual(refusalTexts({ error: "claude refused" }), []);
  assert.deepEqual(refusalTexts({ refusals: [], refusalHints: [] }), []);
  assert.deepEqual(refusalTexts(undefined), []);
});

// ── 句（errorText）───────────────────────────────────────────────────

test("capture-ledger の句は辞書で訳し、知らない句は届いた字のまま", () => {
  assert.equal(errorText({ error: "unknown script ids", ids: ["gone"] }), "知らないスクリプトの id です");
  assert.equal(inEnglish(() => errorText({ error: "unknown script ids", ids: ["gone"] })), "Unknown script ids");
  assert.equal(errorText({ error: "a crawl is already in progress" }), "走行中のクロールがあります");
  assert.equal(inEnglish(() => errorText({ error: "invalid cron" })), "Cannot read the cron expression");
  // 辞書に無い句（新しい capture-ledger・flow だけが叩くエンドポイントの句）
  assert.equal(errorText({ error: "this level is being reported" }), "this level is being reported");
  assert.equal(inEnglish(() => errorText({ error: "this level is being reported" })), "this level is being reported");
});

test("Fastify の定型の答えは、状態の名前（error）ではなく中身（message）を出す", () => {
  const invalid = { statusCode: 400, code: "FST_ERR_VALIDATION", error: "Bad Request", message: "body/seeds must be array" };
  const noRoute = { statusCode: 404, error: "Not Found", message: "Route POST:/api/crawls not found" };
  for (const said of [errorText, (body) => inEnglish(() => errorText(body))]) {
    assert.equal(said(invalid), "body/seeds must be array");
    assert.equal(said(noRoute), "Route POST:/api/crawls not found");
  }
  // 状態の名前を句として辞書に入れると、message より先に当たって中身が出なくなる
  for (const name of Object.values(STATUS_CODES)) {
    for (const lang of ["ja", "en"]) assert.equal(Object.hasOwn(DICTS[lang], `ledger.error.${name}`), false, name);
  }
});

test("message も持つ capture-ledger の答えは、句を辞書に入れていなければ message を出す（検索の 503）", () => {
  const unavailable = { error: "search unavailable", message: "OpenSearch did not answer — full-text search is required" };
  assert.equal(errorText(unavailable), unavailable.message);
});

test("workbench の server の句が先。2 つの句の一覧は重ならない", () => {
  assert.equal(errorText({ error: "not signed in" }), "サインインしていません");
  const ledger = under("ja", "ledger.error.");
  assert.ok(ledger.length > 0);
  assert.deepEqual(ledger.filter((phrase) => ERROR_PHRASES.includes(phrase)), []);
  assert.deepEqual(under("en", "ledger.error.").sort(), [...ledger].sort());
});

test("句の文は値を埋めず、日本語は日本語の字を持ち、英語は持たず大文字か固有の名前で始まる", () => {
  for (const phrase of under("ja", "ledger.error.")) {
    const name = `ledger.error.${phrase}`;
    for (const lang of ["ja", "en"]) assert.deepEqual([...argsOf(IntlMessageFormat, DICTS[lang][name])], [], name);
    assert.match(DICTS.ja[name], JA, name);
    assert.doesNotMatch(DICTS.en[name], JA, name);
    assert.match(DICTS.en[name], /^(?:[A-Z]|ts-compile-service )/u, name);
    // 文の終わりに句点を付けない（呼び手が「: 名指した物」や括弧を後ろに繋ぐ）
    assert.doesNotMatch(DICTS.ja[name], /。$/u, name);
    assert.doesNotMatch(DICTS.en[name], /\.$/u, name);
  }
});

test("区切りの字は、capture-ledger が文を組むときと同じ", () => {
  assert.equal(t("ledger.list.values"), "・");
  assert.equal(t("ledger.list.names"), ", ");
  assert.equal(t("ledger.list.hints"), " / ");
  assert.equal(inEnglish(() => t("ledger.list.values")), ", ");
  assert.equal(inEnglish(() => t("ledger.list.names")), ", ");
  assert.equal(inEnglish(() => t("ledger.list.hints")), " / ");
});

// ── 同じ句から、2 通りの日本語を出さない ─────────────────────────────

test("句を見て専用の文を出す所は、同じ句の辞書の文で始まる", () => {
  const said = (phrase) => errorText({ error: phrase });
  const invalidCron = createAnswer(400, { error: "invalid cron", hint: "cron must have 5 fields" }).text;
  assert.equal(invalidCron, `${said("invalid cron")}（cron must have 5 fields）`);
  const tooOften = createAnswer(400, { error: "cron runs too often", gapMinutes: 5, minIntervalMinutes: 60 }).text;
  assert.ok(tooOften.startsWith(`${said("cron runs too often")}（`), tooOften);
  // 状態の数だけを見て専用の文を出す所（409）も、同じ言い方
  assert.ok(startAnswer(409, { error: "a crawl is already in progress" }).text.startsWith(`${said("a crawl is already in progress")}。`));
  assert.ok(createAnswer(409, { error: "a schedule with this name already exists" }).text.startsWith(`${said("a schedule with this name already exists")}。`));
  assert.ok(t("crawls.diag.lacksValues").startsWith(`${said("missing variables")}。`));
  // 英語でも、cron の 2 つの専用の文は同じ句の辞書の文で始まる
  inEnglish(() => {
    assert.ok(createAnswer(400, { error: "invalid cron", hint: "cron must have 5 fields" }).text.startsWith(`${said("invalid cron")} (`));
    assert.ok(
      createAnswer(400, { error: "cron runs too often", gapMinutes: 5, minIntervalMinutes: 60 }).text.startsWith(`${said("cron runs too often")} (`),
    );
  });
  // 句を見るが、専用の文は出さない所（見分けるだけ）は、errorText の文をそのまま出す
  assert.equal(changesError(404, { error: "not found" }), `404 —— ${said("not found")}`);
  assert.equal(diagnosisOf(404, { error: "not found" }).text, `404 —— ${said("not found")}`);
  assert.equal(fixAnswer(404, { error: "not found" }).text, `404 —— ${said("not found")}`);
});

// ── 答えを文にする所 ─────────────────────────────────────────────────

const WINDMILL = { secrets: scenario.windmillSecrets, variables: scenario.windmillVariables, editedAt: scenario.capturedAt };
const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const versions = catalogOf(scenario);
/** 代役に頼んで、断りの答えを取り出す。 */
const refusedBy = (body, formats) => {
  const answer = submitCrawl([], { seeds: ["https://site.test/"], ...body }, NOW, 15, versions, WINDMILL, formats);
  assert.equal(answer.status, 400);
  return answer.body;
};
const inline = (source, params) => ({ inline: { name: "probe", phase: "behavior", source, ...(params === undefined ? {} : { params }) } });
/** hints を返さない古い capture-ledger の答え（同じ本文から hints を落とした物）。 */
const withoutHints = ({ hints, ...rest }) => rest;

test("代役の断り（hints つき）を始める答えにすると、日本語は hints の無い答えと同じ字、英語は理由まで英語", () => {
  const misfit = refusedBy({
    scripts: [inline('const { level } = defineParams(z.object({ level: z.enum(["low", "high"]) }));')],
    variables: { level: "mid" },
  });
  assert.equal(misfit.hints.length, 1);
  assert.equal(startAnswer(400, misfit).text, "400 —— 変数の値が宣言の形に合いません: level（level は low・high のどれか）");
  assert.equal(startAnswer(400, misfit).text, startAnswer(400, withoutHints(misfit)).text);
  assert.equal(
    inEnglish(() => startAnswer(400, misfit).text),
    "400 — Invalid variables: level (level must be one of low, high)",
  );

  const twice = refusedBy({ scripts: [inline("x;", [{ name: "q", kind: "secret" }, { name: "q", kind: "secret" }])] });
  assert.equal(startAnswer(400, twice).text, "400 —— params の宣言を読めません: inline-probe（params に q が 2 度ある）");
  assert.equal(startAnswer(400, twice).text, startAnswer(400, withoutHints(twice)).text);
  assert.equal(inEnglish(() => startAnswer(400, twice).text), "400 — Invalid params: inline-probe (q appears twice in params)");

  const asVariable = refusedBy({ scripts: [inline("x;", [{ name: "q", kind: "variable" }])] });
  assert.equal(startAnswer(400, asVariable).text, startAnswer(400, withoutHints(asVariable)).text);
  assert.equal(
    inEnglish(() => startAnswer(400, asVariable).text),
    "400 — Invalid params: inline-probe (params can only declare secrets. Declare variables with defineParams in the source)",
  );

  const formats = refusedBy({ scripts: [inline("x;", [{ name: "api_token", kind: "secret" }])] }, ["wacz", "png"]);
  assert.equal(startAnswer(400, formats).text, startAnswer(400, withoutHints(formats)).text);
  const english = inEnglish(() => startAnswer(400, formats).text);
  assert.match(english, /^400 — Secrets the formats cannot hide: api_token \(png in CAPTURE_LEDGER_CAPTURE_FORMATS cannot replace/);
  assert.doesNotMatch(english, JA);
});

test("鍵の無い hints（命令の例・スクリプトの id の並び）は、どちらの言語でも届いた字のまま添える", () => {
  const bodies = [
    refusedBy({ scripts: [inline("x;", [{ name: "nope", kind: "secret", required: true }])] }),
    refusedBy({ scripts: [{ catalog: "egov-law-search" }], variables: { query: "x" } }),
    submitCrawl([], { seeds: ["https://site.test/"] }, NOW, 15, []).body,
    submitCrawl([], { seeds: ["https://site.test/"] }, NOW, 15, versions.filter((v) => v.id === "egov-law-search")).body,
  ];
  assert.deepEqual(bodies.map((body) => body.error), [
    "unknown secrets",
    "site scripts need a seed on their site",
    "no scripts are registered",
    "no default scripts for these seeds",
  ]);
  for (const body of bodies) {
    assert.ok(body.hints.length > 0 && body.hints.every((hint) => !("key" in hint)), body.error);
    assert.equal(startAnswer(400, body).text, startAnswer(400, withoutHints(body)).text, body.error);
    assert.ok(startAnswer(400, body).text.endsWith(`（${body.hint}）`), body.error);
    assert.ok(inEnglish(() => startAnswer(400, body).text).endsWith(` (${body.hint})`), body.error);
  }
});

test("予定の答え: cron の理由（鍵の無い hints）は届いた字のまま、頼みの中身の断りは始める答えと同じ文", () => {
  const invalid = createSchedule([], { name: "a", cron: "0 0 4 * * *" }).body;
  assert.deepEqual(invalid.hints, [{ text: "cron must have 5 fields" }]);
  assert.equal(createAnswer(400, invalid).text, "cron の式を読めません（cron must have 5 fields）");
  assert.equal(createAnswer(400, invalid).text, createAnswer(400, withoutHints(invalid)).text);
  assert.equal(inEnglish(() => createAnswer(400, invalid).text), "Cannot read the cron expression (cron must have 5 fields)");
  assert.equal(createAnswer(400, MISFITS).text, startAnswer(400, MISFITS).text);
  assert.equal(
    inEnglish(() => actionAnswer("repin", 400, MISFITS).text),
    "400 — Invalid variables: code, level (code must be at most 2 characters / level must be one of low, high)",
  );
});

test("宣言を確かめる答えと、型の誤りを取り直す答えも、句を訳す", () => {
  assert.equal(inlineDeclared(503, { error: "ts-compile unreachable" }).note, "宣言を確かめられません（503 —— ts-compile-service に届きません）");
  assert.equal(inEnglish(() => diagnosisOf(404, { error: "not found" }).text), "404 — Not found");
  assert.equal(inEnglish(() => fixAnswer(409, { error: "scripts compile" }).text), "409 — The scripts compile");
});
