/**
 * 画面の文言。**書く所には鍵だけを置き、文は言語ごとの辞書（`i18n/ja.json`・`i18n/en.json`）に置く。**
 *
 * 辞書は「鍵 → ICU MessageFormat の文」の平らな JSON で、wacz-validator の辞書と同じ形。文にするのは同梱した
 * `vendor/intl-messageformat.js`（束の作り直しは `npm run vendor`）。埋め込みは `{name}`、英語の単数と複数は
 * `{n, plural, one {…} other {…}}`、要素が挟まる文は `<code>…</code>` のようなタグで書く。
 *
 * ブラウザは `/i18n.js` として読み、試験は `node --test` から import する（`format.js` と同じ）。だから、
 * `location`・`document` が無い所でも読めるように書く —— 無ければ何も読まずに既定の言語になる。
 *
 * ## 言語を決めるのは、読み込みのときに 1 度だけ
 *
 * 順は `chooseLang`: URL の `?lang=`（その回だけ）→ 画面の切り替えで覚えた選び（`localStorage`）→ ブラウザの言語
 * → 英語。画面を描いた後に言語が変わることは無いので、描く側は「いまの言語」を気にせずに `t()` を呼ぶ。
 * 切り替え（`switchLang`）は、選びを覚えて頁を読み直す。試験は `setLang()` で固定する（`test/lang-ja.mjs`）。
 *
 * ## 鍵は、文字列をそのまま書く
 *
 * `t("crawls.state.running")` のように書き、組み立てない —— `check:i18n` が、コードが名指す鍵と辞書を両方向で
 * 照らすため。値から字への対応は、鍵の表ではなく、字を返す関数で書く（`start.js` の `actionText`）。
 * 届いたデータの句を引く所（`phraseText`）のように `t()` の外に鍵を書くときは、`key("…")` で包む（中身は
 * そのまま返す。鍵だと分かる印で、検査が「使っている鍵」に数える）。
 */
import { IntlMessageFormat } from "./vendor/intl-messageformat.js";
import ja from "./i18n/ja.json" with { type: "json" };
import en from "./i18n/en.json" with { type: "json" };

/** 画面が持つ言語。辞書はこの数だけ在る。 */
export const LANGS = Object.freeze(["ja", "en"]);
const DICTS = { ja, en };

/** 画面の切り替えで覚えた選びを置く、`localStorage` の名前。 */
export const LANG_STORAGE = "workbench.lang";

/**
 * 言語を選ぶ。順は:
 *
 *   1. URL の `?lang=`（その回だけ。覚えた選びは変えない）
 *   2. 画面の切り替えで覚えた選び
 *   3. ブラウザの言語の並び（`navigator.languages`）で、最初に当たる物（`ja-JP` は `ja`）
 *   4. 英語
 *
 * 知らない値は、無いのと同じ。
 */
export const chooseLang = ({ query, stored, languages = [] } = {}) => {
  if (LANGS.includes(query)) return query;
  if (LANGS.includes(stored)) return stored;
  for (const tag of languages) {
    const primary = String(tag).toLowerCase().split("-")[0];
    if (LANGS.includes(primary)) return primary;
  }
  return "en";
};

/** 読めなければ undefined（`localStorage` は、設定によっては触るだけで投げる）。 */
const read = (fn) => {
  try {
    return fn() ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * ブラウザが言っていること。**頁の無い所（試験の node）では何も読まない** —— node にも `navigator.languages` が
 * 在り、機械ごとに値が違う。
 */
const browserSays = () =>
  globalThis.document === undefined || globalThis.location === undefined
    ? {}
    : {
        query: read(() => new URLSearchParams(globalThis.location.search).get("lang")),
        stored: read(() => globalThis.localStorage.getItem(LANG_STORAGE)),
        languages: read(() => globalThis.navigator.languages),
      };

let lang = chooseLang(browserSays());
/** 文にする器（`IntlMessageFormat`）の控え。鍵は「言語 + 改行 + 辞書の鍵」。 */
const compiled = new Map();

/** いまの言語（`"ja"` か `"en"`）。検証の報告の言語を頼むときにも使う。 */
export const langOf = () => lang;

/**
 * 言語を替える。**試験のための関数** —— ブラウザでは読み込みの後に呼ばない（描いた字は描き直されない）。
 * 知らない値は投げる。
 */
export const setLang = (next) => {
  if (!LANGS.includes(next)) throw new Error(`unknown language: ${String(next)}`);
  lang = next;
};

/**
 * 切り替えた後に開く URL。`?lang=` を外す —— 残すと、覚えた選びより `?lang=` が勝って、言語が変わらない。
 * 選びを覚えられなかったとき（`remembered` が false）は、`?lang=` に書いて運ぶ。
 */
export const switchedUrl = (href, next, remembered) => {
  const url = new URL(href);
  if (remembered) url.searchParams.delete("lang");
  else url.searchParams.set("lang", next);
  return url.href;
};

/**
 * 画面の切り替え。選びを覚え、頁を読み直す（描いた字は描き直さないので、読み直しが要る）。
 * 書きかけを確かめるのは呼び手（`app.js`）。
 */
export const switchLang = (next) => {
  if (!LANGS.includes(next)) throw new Error(`unknown language: ${String(next)}`);
  let remembered = true;
  try {
    globalThis.localStorage.setItem(LANG_STORAGE, next);
  } catch {
    remembered = false;
  }
  // hash だけが違う URL へ移っても、頁は読み直されない。URL を書き換えてから、読み直す
  globalThis.history.replaceState(null, "", switchedUrl(globalThis.location.href, next, remembered));
  globalThis.location.reload();
};

/** 鍵だと分かる印。`t()` の外に鍵を書く所で包む。中身はそのまま返す。 */
export const key = (name) => name;

/** 辞書にその鍵が在るか。届いた句（誤りの `error`）を訳せるかを、引く前に見る。 */
export const has = (name) => Object.hasOwn(DICTS[lang], name);

const formatOf = (name) => {
  const id = `${lang}\n${name}`;
  let format = compiled.get(id);
  if (format === undefined) {
    const text = DICTS[lang][name];
    if (text === undefined) return undefined;
    format = new IntlMessageFormat(text, lang);
    compiled.set(id, format);
  }
  return format;
};

/**
 * 鍵を、いまの言語の文にする。値の渡し忘れは library が投げる（試験が赤になる）。辞書に無い鍵は、鍵をそのまま
 * 返す —— 画面を止めずに、どの鍵が無いかを見せる（`check:i18n` が先に止めるので、ふつうは起きない）。
 */
export const t = (name, params = {}) => {
  const format = formatOf(name);
  if (format === undefined) return name;
  return String(format.format(params));
};

/**
 * 要素が挟まる文を、字と要素の並びにする。`parts` は、辞書の文のタグの名前から「中の字を受けて要素を返す関数」への
 * 対応（`{ code: (text) => 要素 }`）と、ふつうの値。返した並びは `append(...)` に渡す。
 * 生の HTML を差し込む API は使わない —— 辞書の文も、字として置く。
 */
export const tNodes = (name, parts = {}) => {
  const format = formatOf(name);
  if (format === undefined) return [name];
  const wrapped = Object.fromEntries(
    Object.entries(parts).map(([part, value]) => [
      part,
      typeof value === "function" ? (chunks) => value(chunks.join("")) : value,
    ]),
  );
  const out = format.format(wrapped);
  return Array.isArray(out) ? out : [out];
};

/**
 * 届いたデータの句（保存された失敗の理由など）を、辞書に在れば訳す。無ければ届いた字のまま ——
 * ほかのシステムが書いた字と、辞書を足す前に保存された字は、言い換えずに出す。`prefix` は鍵の頭。
 */
export const phraseText = (prefix, phrase) => {
  const name = `${prefix}.${String(phrase)}`;
  return typeof phrase === "string" && has(name) ? t(name) : phrase;
};

/**
 * 日時。**日本語は、いままでと同じ呼び方のまま**（`toLocaleString("ja-JP")`。`2026/1/5 4:00:00`）。
 * `dateStyle: "medium"` にそろえると、月や日が 1 桁のときに字が変わる（`2026/01/05`）。英語は `Nov 13, 2026, 4:00:00 AM`。
 */
export const dateTime = (date) =>
  lang === "ja"
    ? date.toLocaleString("ja-JP")
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium" }).format(date);

/** 時刻だけ。日本語は `4:00:00`、英語は `4:00:00 AM`。 */
export const timeOfDay = (date) =>
  lang === "ja"
    ? date.toLocaleTimeString("ja-JP")
    : new Intl.DateTimeFormat("en", { timeStyle: "medium" }).format(date);

/**
 * 誤りの答え（JSON の本文）を、画面に出す 1 文にする。**読む順はここ 1 か所で決める**:
 *
 *   1. capture-workbench の server の句（`{ error: 句, params }`。`src/lib.mjs` の `ERROR_PHRASES`）は、
 *      辞書の `workbench.error.<句>` で訳す
 *   2. `message`。capture-ledger の検査の答え（Fastify の 400 など）は、`error` が「Bad Request」のような
 *      状態の名前で、中身は `message` に在る
 *   3. `error`。capture-ledger の英語の句
 *
 * どれも無ければ undefined —— 何を読めなかったかは、呼び手が言う。
 */
export const errorText = (body) => {
  if (body === null || typeof body !== "object") return undefined;
  if (typeof body.error === "string") {
    const name = `workbench.error.${body.error}`;
    if (has(name)) {
      try {
        return t(name, body.params ?? {});
      } catch {
        return body.error; // 値の足りない答え（古い server）。句のまま出す
      }
    }
  }
  if (typeof body.message === "string") return body.message;
  return typeof body.error === "string" ? body.error : undefined;
};

/** 辞書の文のタグのうち、HTML の側（`data-i18n`）で要素にする物。 */
const HTML_TAGS = ["code", "b"];

/**
 * HTML に書いた鍵に、字を入れる。`index.html` は字を書かず、`data-i18n="鍵"`（中身）と
 * `data-i18n-placeholder`・`data-i18n-aria-label`・`data-i18n-title`（属性）を書く。
 * `<html lang>` も、いまの言語にする。
 */
export const applyI18n = (root = document) => {
  root.documentElement.lang = lang;
  const element = (tag) => (text) => {
    const el = root.createElement(tag);
    el.textContent = text;
    return el;
  };
  const parts = Object.fromEntries(HTML_TAGS.map((tag) => [tag, element(tag)]));
  for (const el of root.querySelectorAll("[data-i18n]")) el.replaceChildren(...tNodes(el.dataset.i18n, parts));
  for (const attr of ["placeholder", "aria-label", "title"]) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
};
