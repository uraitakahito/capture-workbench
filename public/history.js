/**
 * URL の履歴の画面（`/history/<URL>`・CAPTURE-462）の、画面に依らない部分。capture-ledger の `GET /api/history`（同じ URL の
 * 取り込みの一覧）・`GET /api/archives/:id/changes`（選んだ 2 本の差分）・`POST /api/archives/:id/changes/summary`（その差分の
 * Claude の要約）の答えを、字と印にするだけで、比べも要約もしない。DOM には触らない —— ブラウザは `/history.js` として読み、
 * 試験は `node --test` から import する。
 *
 * ここが決めるのは 2 つだけ:
 *
 *   - **行の印**（「1 つ前から」と「撮り方が替わった」）。届いた行の文字の digest と撮り方の digest を、隣どうしで見比べる。
 *     capture-ledger に数えさせない —— 数えさせると、見てよくない取り込みと同じ文字かどうかが漏れる。見えている行だけで言う
 *   - **どの 2 本を選ぶか**。「前」は必ず「今」より古い、比べられる行
 *
 * **要約は証拠ではない。** 添え書きは変化の画面と同じ字（`changes.js` の `summaryLine`・`pageClaudeLine`）で、必ず
 * 「証拠ではない」と model・決まりの文の版・費用を言う。字は辞書（`i18n/*.json` の `history.*`）に在る。
 */
import { errorText, t } from "./i18n.js";
import { japaneseNote, pageClaudeLine, significanceMarkOf, summaryLine } from "./changes.js";
import { routeMissing } from "./fix.js";

/** 同じ URL の取り込みの一覧。`before` は続きを引くときに、前の答えの `next` を渡す。 */
export const historyPath = (url, before) =>
  `/api/history?${new URLSearchParams(before === undefined || before === null ? { url } : { url, before })}`;

/** 2 本の差分。`afterId` が「今」、`beforeId` が「前」。 */
export const archiveChangesPath = (afterId, beforeId) =>
  `/api/archives/${encodeURIComponent(afterId)}/changes?${new URLSearchParams({ since: beforeId })}`;

/** その差分の要約を頼む POST。本文は `summaryBody`。 */
export const summaryPath = (afterId) => `/api/archives/${encodeURIComponent(afterId)}/changes/summary`;
export const summaryBody = (beforeId) => ({ since: beforeId });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 画面の path。`/history/<URL>`・`/history/<URL>/<今の id>`・`/history/<URL>/<前の id>/<今の id>`。URL は符号にする
 * （`encodeURIComponent`。`/` を残すと、id との境が分からない）。「前」だけの形は無い —— 「今」が無ければ URL だけ。
 */
export const historyHref = (url, { beforeId, afterId } = {}) => {
  const head = `/history/${encodeURIComponent(url)}`;
  if (afterId === undefined || afterId === null) return head;
  return beforeId === undefined || beforeId === null ? `${head}/${afterId}` : `${head}/${beforeId}/${afterId}`;
};

/** `historyHref` の逆。違う形・壊れた符号・空の URL・id の形でない物は undefined。 */
export const parseHistoryHref = (hash) => {
  const text = String(hash);
  if (!text.startsWith("/history/")) return undefined;
  const parts = text.slice("/history/".length).split("/");
  if (parts.length > 3 || !parts.slice(1).every((id) => UUID.test(id))) return undefined;
  let url;
  try {
    url = decodeURIComponent(parts[0]);
  } catch {
    return undefined;
  }
  if (url === "") return undefined;
  return parts.length === 3
    ? { url, beforeId: parts[1], afterId: parts[2] }
    : { url, beforeId: undefined, afterId: parts[1] };
};

/** 比べられる行か（capture-ledger が訳を言わず、文字の digest を持つ）。 */
export const comparable = (row) =>
  (row.notComparable === null || row.notComparable === undefined) && typeof row.text?.sha256 === "string";

/**
 * 行の印。`rows` は新しい順（capture-ledger の答えのまま）、`more` は続きが在るか（答えの `next` が null でない）。
 * 行と同じ並びで `{ change, reason, recipeChanged }` を返す:
 *
 *   - `change` —— `same`・`changed`（1 つ前の**比べられる行**と文字の digest が同じか違うか。比べられない行は飛ばす）・
 *     `first`（それより古い比べられる行が無い）・`unknown`（読んだ中には無いが、続きが在る）・`not_comparable`
 *     （この行が比べられない。訳は `reason`）
 *   - `recipeChanged` —— 1 つ前の**撮り方の分かる行**と撮り方の digest が違う。撮り方の分からない行には付けない
 */
export const marksOf = (rows, more) =>
  rows.map((row, i) => {
    const older = rows.slice(i + 1);
    const knows = (r) => typeof r.recipeSha256 === "string";
    const lastRecipe = knows(row) ? older.find(knows) : undefined;
    const recipeChanged = lastRecipe !== undefined && lastRecipe.recipeSha256 !== row.recipeSha256;
    if (!comparable(row)) {
      return { change: "not_comparable", reason: row.notComparable ?? "no_text", recipeChanged };
    }
    const last = older.find(comparable);
    const change =
      last === undefined ? (more ? "unknown" : "first") : last.text.sha256 === row.text.sha256 ? "same" : "changed";
    return { change, reason: undefined, recipeChanged };
  });

/** 比べられない訳の字（一覧の行の `notComparable` と、差分の答えの `reason`）。知らない訳は届いた字のまま。 */
export const reasonText = (reason) => {
  switch (reason) {
    case "not_inspected":
      return t("history.reason.notInspected");
    case "no_text":
      return t("history.reason.noText");
    case "withheld":
      return t("history.reason.withheld");
    case "wacz_missing":
      return t("history.reason.waczMissing");
    case "too_large":
      return t("history.reason.tooLarge");
    default:
      return String(reason);
  }
};

/** 「1 つ前から」の欄の字と色（色は `.state` の名前）。 */
export const changeMarkOf = (mark) => {
  switch (mark.change) {
    case "same":
      return { kind: "ok", text: t("history.change.same") };
    case "changed":
      return { kind: "content", text: t("history.change.changed") };
    case "first":
      return { kind: "", text: t("history.change.first") };
    case "unknown":
      return { kind: "", text: t("history.change.unknown") };
    default:
      return { kind: "bad", text: t("history.change.notComparable", { reason: reasonText(mark.reason) }) };
  }
};

/**
 * 2 本の差分の見出しの字と色。要約が在れば Claude の付けた重さ（中身の変化・小さい変化・意味のある変化なし。変化の画面の
 * 1 ページの見出しと同じ字と色）、無ければ「変わった」。同じ 2 本は「同じ」。差分の無い答え（比べられない）は undefined。
 */
export const diffMarkOf = (answer) => {
  if (answer?.state === "same") return changeMarkOf({ change: "same" });
  if (answer?.state !== "diffed") return undefined;
  return significanceMarkOf(answer.significance) ?? changeMarkOf({ change: "changed" });
};

/**
 * 末尾の `/` の有無だけを替えた URL。取り込みが 1 本も無い URL の画面が、「こちらではないか」と出す（capture-ledger は
 * path の末尾の `/` の有無を別の URL として扱う。`https://a.test/group` と `https://a.test/group/` は別）。path が `/` だけの
 * URL（替えようが無い）と、http(s) の URL として読めない字は undefined。query と `#` より後ろはそのまま残す。
 */
export const slashVariantOf = (url) => {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (parsed.pathname === "/") return undefined;
  parsed.pathname = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : `${parsed.pathname}/`;
  return parsed.toString();
};

/**
 * 選ぶ 2 本。`named` は hash が名指した id（`parseHistoryHref` の `beforeId`・`afterId`）。
 *
 *   - 名指しが無ければ、いちばん新しい比べられる行と、その 1 つ前の比べられる行。比べられる行が 1 本以下なら選ばない
 *     （続きを読めば 2 本そろいうる）
 *   - 「今」だけの名指しなら、その行と、それより古い最初の比べられる行
 *   - 2 本の名指しなら、その 2 本。**「前」は「今」より古い比べられる行のときだけ**選ぶ（違えば「今」だけ）
 *
 * `missing` は読んだ行に無かった id、`unusable` は在ったが比べられない id。`wanting` は、続きを読めば答えが変わりうるか
 * （名指しの行がまだ無い・「今」より古い比べられる行がまだ無い・比べられる行が 2 本そろっていない）—— 呼び手は、
 * 続きが在る間だけ読み足す。
 */
export const pickPair = (rows, named = {}) => {
  const none = { beforeId: undefined, afterId: undefined, missing: [], unusable: [], wanting: false };
  if (named.afterId === undefined || named.afterId === null) {
    const usable = rows.filter(comparable);
    return usable.length < 2 ? { ...none, wanting: true } : { ...none, afterId: usable[0].id, beforeId: usable[1].id };
  }
  const at = rows.findIndex((row) => row.id === named.afterId);
  if (at === -1) return { ...none, missing: [named.afterId], wanting: true };
  if (!comparable(rows[at])) return { ...none, unusable: [named.afterId] };
  const older = rows.slice(at + 1);
  if (named.beforeId === undefined || named.beforeId === null) {
    const before = older.find(comparable);
    return { ...none, afterId: named.afterId, beforeId: before?.id, wanting: before === undefined };
  }
  const before = older.find((row) => row.id === named.beforeId);
  if (before !== undefined) {
    return comparable(before)
      ? { ...none, afterId: named.afterId, beforeId: before.id }
      : { ...none, afterId: named.afterId, unusable: [named.beforeId] };
  }
  // 読んだ行に在るが「今」より新しい（か「今」と同じ）なら、続きを読んでも出てこない。選ばずに「今」だけ
  const known = rows.some((row) => row.id === named.beforeId);
  return { ...none, afterId: named.afterId, missing: known ? [] : [named.beforeId], wanting: !known };
};

/**
 * 「今」を選び直した後の 2 本。「前」が新しい「今」より古いままなら残し、違えば、それより古い最初の比べられる行に替える
 * （無ければ「今」だけ）。比べられない行は選べない（元のまま返す）。
 */
export const withAfter = (rows, pair, afterId) => {
  const at = rows.findIndex((row) => row.id === afterId);
  if (at === -1 || !comparable(rows[at])) return pair;
  const older = rows.slice(at + 1);
  const kept = older.some((row) => row.id === pair.beforeId && comparable(row));
  return { afterId, beforeId: kept ? pair.beforeId : older.find(comparable)?.id };
};

/** 「前」に選べる行か。「今」より古い、比べられる行だけ（「今」が無ければ、どれも選べない）。 */
export const mayBeBefore = (rows, pair, id) => {
  const at = rows.findIndex((row) => row.id === pair.afterId);
  return at !== -1 && rows.slice(at + 1).some((row) => row.id === id && comparable(row));
};

/** 「前」を選び直した後の 2 本。選べない行なら元のまま。 */
export const withBefore = (rows, pair, beforeId) =>
  mayBeBefore(rows, pair, beforeId) ? { afterId: pair.afterId, beforeId } : pair;

/** どこで撮ったか（行の `origin`）。予定の名前か、手で始めたクロールか。知らない形は「分からない」。 */
export const originText = (origin) => {
  if (origin?.kind === "schedule") {
    return typeof origin.scheduleName === "string"
      ? t("history.origin.schedule", { name: origin.scheduleName })
      : t("history.origin.scheduleGone");
  }
  return origin?.kind === "manual" ? t("history.origin.manual") : t("history.origin.unknown");
};

/** capture-ledger の答えの文（句は辞書に在れば訳す）。無ければそう言う。 */
const saidOf = (body) => errorText(body) ?? t("common.noText");

/**
 * 一覧と差分の読み取りの失敗の字。経路が無い 404（Fastify の文。古い capture-ledger）と、capture-ledger が自分で書く 404
 * （句は `not found`。取り込みが無い・見てよくない）を言い分ける。ほか（400 `invalid url`・422 `different url`・
 * 502 `storage unreachable`）は、状態の数と句の文（`errorText`）。
 */
export const historyError = (status, body) => {
  if (status === 0) return t("common.unreachable", { said: saidOf(body) });
  if (routeMissing(status, body)) return t("history.error.noRoute");
  return t("history.error.statusSaid", { status: String(status), said: saidOf(body) });
};

/**
 * 要約を頼んだ答え（200 でない物）の 1 行。経路が無い 404 は「この capture-ledger では使えない」（Claude の鍵の無い配備には
 * 経路ごと無い）、429 は月の上限（使った額と上限を添える）、ほか（422 の断り・502 の答えない）は状態の数と句の文。
 */
export const summaryRefusal = (status, body) => {
  if (status === 0) return t("common.unreachable", { said: saidOf(body) });
  if (routeMissing(status, body)) return t("history.summary.noRoute");
  if (status === 429 && typeof body?.spentUsd === "number" && typeof body?.budgetUsd === "number") {
    return t("history.summary.budget", {
      said: saidOf(body),
      spentUsd: body.spentUsd.toFixed(4),
      budgetUsd: String(body.budgetUsd),
    });
  }
  return t("history.summary.statusSaid", { status: String(status), said: saidOf(body) });
};

/**
 * 要約の添え書き（差分の答えの `summary` が在るときだけ。無ければ空）。上から、「Claude の要約（証拠ではない）」と model・
 * 決まりの文の版・費用、Claude の 1 行（在れば）、日本語でない画面にだけ「要約は日本語」の断り。`muted` は薄く出す行。
 */
export const summaryLinesOf = (change) => {
  if (change?.summary === null || change?.summary === undefined) return [];
  const japanese = japaneseNote();
  return [
    { text: summaryLine(change.summary), muted: true },
    ...(typeof change.headline === "string" ? [{ text: pageClaudeLine(change.headline), muted: false }] : []),
    ...(japanese === undefined ? [] : [{ text: japanese, muted: true }]),
  ];
};

/** 差分の上の断り（撮り方が違う・比べた行が違う）。どちらかの撮り方が分からない（`recipeDiffers` が null）ときは言わない。 */
export const differsNotes = (change) => [
  ...(change?.recipeDiffers === true ? [t("history.diff.recipeDiffers")] : []),
  ...(change?.stageDiffers === true ? [t("history.diff.stageDiffers")] : []),
];
