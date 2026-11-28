/**
 * 画面の URL（path）の決まり。**画面と server の両方が読む** —— どの path が画面か（server は `index.html` を返し、
 * 画面は `route` で開く）、サインインの後に戻してよい path か、古い hash の URL（`/#trace/…`）をどの path に替えるか。
 * DOM に触らない —— ブラウザは `/paths.js` として読み、server（`src/lib.mjs`・`src/auth.mjs`）と試験は import する。
 *
 * path の形は、v0.61.0 までの hash から `#` を取った形（`#trace/<c>/<p>` → `/trace/<c>/<p>`）。外れは 2 つ:
 * WACZ の画面は `/archive/…`（`/wacz/<id>/<op>` は workbench 自身の API。`src/wacz.mjs` の `OPS`）、検索の語は
 * `/search?q=<語>`（path の区切りに置くと、語が `.`・`..` の時に URL の読みが畳む）。
 */

/**
 * 画面の path の頭の語。**API の頭の語（`api`・`wacz`・`login`・`callback`・`logout`・`healthz`）と、`public/` の
 * file・folder の名を持たない**（`test/paths.test.mjs` が照らす）。持つと、その path が画面に取られる。
 */
export const SCREENS = Object.freeze([
  "crawls",
  "start",
  "schedules",
  "changes",
  "archives",
  "archive",
  "search",
  "scripts",
  "check",
  "links",
  "trace",
  "history",
]);

/** 戻り先として覚える長さの上限。IdP の state と一緒にメモリに持つので、際限なく受けない（画面の path の見分けには掛けない）。 */
export const MAX_PATH = 2000;

/** 印字できる ASCII（`%` の符号を含む）。CR・LF や ASCII の外の字は `Location` に入れると node が投げる。 */
const PRINTABLE = /^[\x21-\x7e]+$/;

/** 区切りが `.`・`..`（符号にした物も）。ブラウザが畳むので、頭の語を照らした後に別の path へ化ける。 */
const DOTS = /^(?:\.|%2e){1,2}$/i;

/**
 * 画面の path か（query を付けてよい。hash は付けない）。server が index.html を返す path と、画面の中で拾う link の
 * 見分けに使う。**よそへ回さない**: `/` 1 つで始まり、`//`・`\`・scheme を持たない。長さは見ない（長い URL の
 * 履歴の画面も開く）—— 戻り先の限りは `isBackPath`。
 */
export const isScreenPath = (href) => {
  if (typeof href !== "string" || !PRINTABLE.test(href)) return false;
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.includes("#")) return false;
  const [pathname] = href.split("?");
  const parts = pathname.split("/").slice(1);
  return SCREENS.includes(parts[0]) && !parts.some((part) => DOTS.test(part));
};

/** 古い hash の頭の語 → path の頭の語。並べていない語は橋を渡らない。 */
const OLD_HEADS = Object.freeze({
  crawls: "crawls",
  start: "start",
  schedules: "schedules",
  changes: "changes",
  archives: "archives",
  wacz: "archive",
  scripts: "scripts",
  check: "check",
  links: "links",
  trace: "trace",
  history: "history",
});

/** ASCII の外の字だけを符号にする（ほかの `%xx` は、そのまま残す）。 */
const encodeOutside = (text) => text.replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c));

/**
 * 古い hash の URL（v0.61.0 まで）を path に替える橋。`#trace/<c>/<p>` → `/trace/<c>/<p>`、
 * `#wacz/…` → `/archive/…`、`#search/<語>` → `/search?q=<語>`。画面の hash でなければ undefined。
 * **橋は外さない** —— 送られた URL と bookmark が、いつまでも残る。
 */
export const pathFromHash = (hash) => {
  const m = /^#([a-z]+)(\/.*)?$/s.exec(String(hash));
  if (m === null) return undefined;
  const [, head, rest = ""] = m;
  let path;
  if (head === "search") {
    let words = "";
    try {
      words = decodeURIComponent(rest.slice(1)).trim();
    } catch {
      words = ""; // 壊れた符号。検索の画面は開き、語は空にする（今の parseSearchHref と同じ）
    }
    path = words === "" ? "/search" : `/search?q=${encodeURIComponent(words)}`;
  } else {
    const to = Object.hasOwn(OLD_HEADS, head) ? OLD_HEADS[head] : undefined;
    if (to === undefined) return undefined;
    path = encodeOutside(`/${to}${rest}`);
  }
  return isScreenPath(path) ? path : undefined;
};

/**
 * サインインの後に戻してよい path か。画面の path で、`MAX_PATH` 字まで（IdP の state と一緒にメモリに持つ）。
 * 長すぎる物は捨てる —— サインインの後は最初の画面に戻る。
 */
export const isBackPath = (href) => isScreenPath(href) && href.length <= MAX_PATH;

/** サインインの画面へ回す URL。戻り先は `encodeURIComponent` で 1 つの値にする（`?from=` が `/login` の query に混ざらない）。 */
export const loginHref = (back) =>
  back === undefined || !isBackPath(back) ? "/login" : `/login?back=${encodeURIComponent(back)}`;

/**
 * 押した link が、画面の中の行き先か。そうなら path と query（画面が `pushState` で開く）、ちがえば undefined
 * （ブラウザに任せる —— `/logout`・`/api/…`・`/wacz/…`・よその origin は server へ届く）。
 */
export const screenTarget = (href, origin) => {
  let url;
  try {
    url = new URL(href, origin);
  } catch {
    return undefined;
  }
  const target = url.pathname + url.search;
  return url.origin === origin && url.hash === "" && isScreenPath(target) ? target : undefined;
};

/**
 * 行き先に、今の URL の `?lang=` を運ぶ。言語の選びを覚えられなかった時（`i18n.js` の `switchedUrl`）は、選びが
 * URL にしか無い —— 運ばないと、次に読み直した時に言語が戻る。
 */
export const keepLang = (href, search) => {
  const lang = new URLSearchParams(search).get("lang");
  if (lang === null) return href;
  const url = new URL(href, "http://workbench.invalid");
  url.searchParams.set("lang", lang);
  return url.pathname + url.search;
};
