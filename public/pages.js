/**
 * クロールの行を開いたときの「ページ」の表と、1 ページのログ。台帳の `GET /api/crawls/:id/pages` と
 * `GET /api/crawls/:id/pages/:page/log` の答えを描く形にするだけで、並べ替えも言い換えもしない（台帳も、
 * BrowserHive の行を届いた順のまま返す）。ここが決めるのは、数の見せ方・絞り込み・読めない理由の文・続きの
 * 引き方と、引き直しをまたいで覚える物。ブラウザは `/pages.js` として読み、試験は `node --test` から import する。
 */
import { count } from "./format.js";

/** ページの一覧の口。`after` は前の答えの `next`（省けば頭から）。件数は台帳の既定に任せる。 */
export const pagesPath = (crawlId, after) =>
  `/api/crawls/${encodeURIComponent(crawlId)}/pages` +
  (after === undefined || after === null ? "" : `?after=${encodeURIComponent(after)}`);

/** 1 ページのログの口。ページはクロールとの組で引く（ほかのクロールのページなら、台帳は 404）。 */
export const logPath = (crawlId, pageId) =>
  `/api/crawls/${encodeURIComponent(crawlId)}/pages/${encodeURIComponent(pageId)}/log`;

/**
 * ページの一覧を、頭から少なくとも `want` 件を覆うまで引く（`read` は口を 1 回引いて答えを返す関数）。
 * **dashboard は自分では続きを取りに行かない** —— `want` は「続きを読む」を押したときだけ増え、0 なら台帳の
 * 1 回分だけを引く。引き直し（走行中は 2 秒ごと）でも、押して読んだ所までは覆い直す。空の答えが来たら、
 * そこで終わりにする（進まない `next` で回り続けない）。
 */
export const readPages = async (read, crawlId, want) => {
  let list = await read(pagesPath(crawlId));
  while (list.next !== null && list.pages.length < want) {
    const more = await read(pagesPath(crawlId, list.next));
    list = { pages: [...list.pages, ...more.pages], next: more.pages.length === 0 ? null : more.next };
  }
  return list;
};

/** 「続きを読む」の字と、押したら覆う件数。続きが無ければ undefined。 */
export const moreOf = (list) =>
  list.next === null
    ? undefined
    : { label: `続きを読む（${count(list.pages.length + 1)} 件目から）`, want: list.pages.length + 1 };

/**
 * 結末: 台帳の state をそのまま、理由（skip_reason）があれば後ろに。**state は言い分けない** —— 決めるのは
 * 台帳で、増えても dashboard を直さずに済む。
 */
export const outcomeOf = (page) =>
  page.reason === null || page.reason === undefined
    ? String(page.state)
    : `${String(page.state)}: ${page.reason}`;

/**
 * ページの行の、level ごとの数（warn か error）。`logCounts` が null なのは「台帳が、その取り込みの
 * `.result.json` から数を読んでいない」で、0 とは別のことなので「—」。0 より大きければ色を付ける。
 * kind は画面の色（bad・warn・muted）で、0 は色なし（undefined）。
 */
export const tallyOf = (counts, level) => {
  const n = counts?.[level];
  if (typeof n !== "number") return { text: "—", kind: "muted" };
  return { text: count(n), kind: n === 0 ? undefined : level === "error" ? "bad" : "warn" };
};

/** level の重さ（BrowserHive の 4 つ）。 */
const WEIGHT = new Map([
  ["debug", 0],
  ["info", 1],
  ["warn", 2],
  ["error", 3],
]);

/** ログの絞り込み（id と字）。「すべて」が既定。 */
export const FILTERS = [
  ["all", "すべて"],
  ["warn", "warn 以上"],
  ["error", "error だけ"],
];

/**
 * 絞り込んだ行（並びは台帳のまま）。**知らない level は隠さない** —— BrowserHive が level を足したとき、
 * 絞り込みが黙って消すと、言い始めたことが画面に出ない（`severityKind` と同じ考え）。
 */
export const linesAt = (lines, filter) =>
  filter === "all"
    ? lines
    : lines.filter((line) => (WEIGHT.get(line.level) ?? Infinity) >= (WEIGHT.get(filter) ?? 0));

/** level の印の色。 */
const KINDS = new Map([
  ["error", "bad"],
  ["warn", "warn"],
  ["info", "info"],
  ["debug", "muted"],
]);

/** level の印の色。知らない level は warn の色（緑や灰に倒さない）。 */
export const levelKind = (level) => KINDS.get(level) ?? "warn";

/** 取り込みの始まりからの ms。 */
export const msOf = (line) => `${count(line.ms)} ms`;

/** 出どころ。スクリプトの行には、どのスクリプトか（BrowserHive が付けた id）を添える。 */
export const sourceOf = (line) =>
  line.script === undefined ? String(line.source) : `${String(line.source)} ${line.script}`;

/** data は JSON のまま 1 行に（文に言い換えない）。無ければ空。 */
export const dataOf = (line) => (line.data === undefined ? "" : JSON.stringify(line.data));

/**
 * 残さなかった行の知らせ。数は BrowserHive の `log.dropped` で、上限で捨てた行と、方針で伏せた文書が
 * console に書いた行（page の行）の合計。どちらの理由かは、ログの中の browserhive の行が言う。0 なら undefined。
 */
export const droppedOf = (dropped) =>
  typeof dropped === "number" && dropped > 0 ? `${count(dropped)} 行は残していない（上限か方針で）` : undefined;

/** WACZ に封じたログの entry（BrowserHive が WACZ Profile 1.19.0 から書く）。 */
export const WACZ_LOG_PATH = "logs/capture.jsonl";

/**
 * WACZ の画面で封じたログを開く先。ページに WACZ（`archiveId`）が無ければ undefined。
 * 1.19.0 より前の WACZ には entry が無い —— 開いた先でそれが見える（ここでは WACZ の中身を引かない）。
 */
export const waczLogTarget = (page) =>
  typeof page?.archiveId === "string" && page.archiveId !== ""
    ? { archiveId: page.archiveId, path: WACZ_LOG_PATH }
    : undefined;

/** ログを読めない理由（台帳の `reason`）を短い文に。 */
const REASONS = new Map([
  ["not-captured", "取り込みの答えがありません（まだ撮っていない・撮らなかった・期限で切った・断られた）"],
  ["no-manifest", "取り込みの答えに、.result.json の場所がありません"],
  ["manifest-missing", "保管庫に .result.json がありません"],
  ["manifest-invalid", ".result.json が契約に合わず、読めません"],
  ["no-log", ".result.json にログがありません（ログを残す前の BrowserHive で撮った）"],
]);

/** 理由の文。知らない理由は「読めません」とだけ言う（理由の字は、画面が隣にそのまま出す）。 */
export const reasonText = (reason) => REASONS.get(reason) ?? "ログを読めません";

/**
 * 開いた行の「ページ」の表で、引き直しをまたいで覚える物（クロールの id → `{ want, logs }`）。**id で覚える**
 * —— 表は引くたびに作り直す（走行中のクロールが在れば 2 秒ごと）ので、DOM に置いただけの物は次の引きで消える。
 *
 *   want  「続きを読む」で覆う件数（0 は台帳の 1 回分）
 *   logs  開いているログ（ページの id → 箱の状態 `{ answer, filter, scrollTop, box }`）。answer は口の答え
 *         （引いている間は undefined、引けなければ Error）。box は app.js が作る DOM の箱で、作り直さずに移す
 *
 * 忘れるのは、行を閉じた時と、クロールが一覧から消えた時（開いた行の `opened` と同じ所）。
 */
export const viewOf = (views, crawlId) => {
  let view = views.get(crawlId);
  if (view === undefined) {
    view = { want: 0, logs: new Map() };
    views.set(crawlId, view);
  }
  return view;
};

/** ログの箱を開け閉めする。開けば新しい箱の状態を、閉じれば undefined を返す。 */
export const toggleLog = (views, crawlId, pageId) => {
  const logs = viewOf(views, crawlId).logs;
  if (logs.delete(pageId)) return undefined;
  const state = { answer: undefined, filter: "all", scrollTop: 0, box: undefined };
  logs.set(pageId, state);
  return state;
};

/**
 * 描くページの行。開いているログには、その箱の状態を添える。**状態は id で引いた同じ物** —— 引き直しで届いた
 * 新しい行（別の object）にも、開いた箱・絞り込み・流した位置がそのまま付いてくる。
 */
export const rowsOf = (views, crawlId, list) => {
  const logs = views.get(crawlId)?.logs;
  return list.pages.map((page) => ({ page, log: logs?.get(page.id) }));
};
