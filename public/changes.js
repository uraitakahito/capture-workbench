/**
 * 前回からの変化（CAPTURE-167）の、画面に依らない部分。capture-ledger の `GET /api/changes`・`GET /api/crawls/:id/changes`・
 * 予定の回の `change` を、字と色にするだけで、判定はしない —— 比べるのも重さを付けるのも capture-ledger（と Claude）。
 * ブラウザは `/changes.js` として読み、試験は `node --test` から import する。
 *
 * **要約は証拠ではない。** 回の要約には「Claude の要約（証拠ではない）」と model・prompt の版・費用を、ページの Claude の
 * 1 行には「証拠ではない」を必ず添える。正は 2 本の WACZ と差分で、差分は Claude なしで作った物。
 *
 * 回の詳細は、左に回の全ページの目次、右に選んだ 1 ページ（CAPTURE-236）。ページは今回の WACZ の id で名指す。
 *
 * 字は辞書（`i18n/*.json` の `changes.*`）に在り、ここは鍵を選んで `t()` に渡す。**Claude の要約と 1 行は、
 * capture-ledger が日本語で書かせた物をそのまま出す**（訳さない）。日本語でない画面には、その断りを添える（`japaneseNote`）。
 */
import { errorText, langOf, t } from "./i18n.js";
import { runDelay, shortTime } from "./schedules.js";

export const CHANGES_PATH = "/api/changes";
export const changeDetailPath = (crawlId) => `/api/crawls/${encodeURIComponent(crawlId)}/changes`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHANGES_HASH = new RegExp(`^#changes/(${UUID})(?:/(${UUID}))?$`);

/** `#changes`・`#changes/<クロールの id>`・`#changes/<クロールの id>/<今回の WACZ の id>`。ほかは undefined。 */
export const parseChangesHash = (hash) => {
  if (hash === "#changes") return { crawlId: undefined, pageId: undefined };
  const m = CHANGES_HASH.exec(String(hash));
  return m === null ? undefined : { crawlId: m[1], pageId: m[2] };
};

/** `parseChangesHash` の逆。ページが無ければ回だけ。 */
export const changesHash = (crawlId, pageId) =>
  pageId === undefined || pageId === null ? `#changes/${crawlId}` : `#changes/${crawlId}/${pageId}`;

/** 重さの字。知らない重さは、届いた字のまま。 */
export const significanceText = (significance) =>
  significance === "none"
    ? t("changes.significance.none")
    : significance === "minor"
      ? t("changes.significance.minor")
      : significance === "content"
        ? t("changes.significance.content")
        : significance;

/**
 * 重さの色。色の種類は `.state` の `ok`・`warn`・`content`。中身の変化は青で目立たせる（悪いわけではないので bad にしない。
 * 小さい変化の琥珀色・走行中の `run` とも分ける）。
 */
const SIGNIFICANCE_KIND = { none: "ok", minor: "warn", content: "content" };

/**
 * 回の変化の字と色（予定の回の欄と、一覧の 1 行）。`change` は capture-ledger の `recentRuns[].change` か一覧の 1 行。
 * 無ければ「—」（まだ比べていない・古い capture-ledger）。
 */
export const changeOf = (change) => {
  if (change === null || change === undefined) return { kind: "", text: "—" };
  /** 違ったページの数と、比べたページの数。 */
  const pages = { changed: change.pagesChanged, compared: change.pagesCompared };
  switch (change.state) {
    case "comparing":
      return { kind: "run", text: t("changes.state.comparing") };
    case "no_previous":
      return { kind: "", text: t("changes.state.noPrevious") };
    case "unchanged":
      return { kind: "ok", text: t("changes.state.unchanged", { n: change.pagesCompared }) };
    case "diffed":
      return { kind: "warn", text: t("changes.state.diffed", pages) };
    case "summarizing":
      return { kind: "run", text: t("changes.state.summarizing", pages) };
    case "budget_wait":
      return { kind: "bad", text: t("changes.state.budgetWait", pages) };
    case "failed":
      return { kind: "bad", text: t("changes.state.failed", pages) };
    case "summarized": {
      if (change.significance === null || change.significance === undefined) {
        return { kind: "", text: change.headline ?? t("changes.state.noSummary") };
      }
      return {
        kind: SIGNIFICANCE_KIND[change.significance] ?? "",
        text: t("changes.state.summarized", { significance: significanceText(change.significance), ...pages }),
      };
    }
    default:
      return { kind: "", text: String(change.state) };
  }
};

/** 帯に出す回の変化の状態。中身の変化そのものでは帯を出さない（毎朝出ると誰も見なくなる）。 */
const CHANGE_BAND = new Set(["budget_wait", "failed"]);

/** 帯の文の行。予定ごとに直近の回だけを見る。 */
export const changeBandLines = (schedules) =>
  schedules.flatMap((schedule) => {
    const change = schedule.recentRuns?.[0]?.change;
    if (change === null || change === undefined || !CHANGE_BAND.has(change.state)) return [];
    return [
      change.state === "budget_wait"
        ? t("changes.band.budgetWait", { name: schedule.name })
        : t("changes.band.failed", { name: schedule.name }),
    ];
  });

/** 要約の添え書き。**必ず**「証拠ではない」と言う。 */
export const summaryLine = (summary) =>
  summary === null || summary === undefined
    ? t("changes.summary.none")
    : t("changes.summary.line", {
        model: String(summary.model),
        promptVersion: String(summary.promptVersion),
        usd: Number(summary.usd).toFixed(4),
      });

/** ページの Claude の 1 行。**必ず**「証拠ではない」と言う。 */
export const pageClaudeLine = (headline) => t("changes.page.claudeLine", { headline: String(headline) });

/**
 * Claude の字（回の要約・ページの 1 行）が日本語のままだという断り。**日本語の画面では出さない**（undefined）——
 * 書かせているのは capture-ledger で、画面の言語に依らず日本語で届く。
 */
export const japaneseNote = () => (langOf() === "ja" ? undefined : t("changes.claude.japaneseNote"));

/**
 * 回の時刻の字（CAPTURE-235）。始まった時刻で言い、本来の時刻から 1 分以上遅れた回にだけ本来の時刻と遅れを添える。
 * 一覧の並びは始まった順なので、並びと字が食い違わない。
 */
export const runTimeText = (run, timeZone) => {
  const started = shortTime(run.startedAt, timeZone);
  const delay = runDelay(run);
  return delay === ""
    ? started
    : t("changes.run.delayed", { started, due: shortTime(run.scheduledFor, timeZone), delay });
};

/** 目次の並び（小さいほど上）。重さの順に、要約の無い差分、差分を作れなかったページ、同じだったページ。 */
const RANK = { content: 1, minor: 2, none: 3 };
const rankOf = (page) =>
  page.state === "prev_missing" ? 5 : (RANK[page.significance] ?? 4);
const rowText = (page) =>
  page.state === "prev_missing"
    ? { kind: "bad", text: t("changes.page.prevMissing") }
    : page.significance === null || page.significance === undefined
      ? { kind: "", text: t("changes.page.diffOnly") }
      : { kind: SIGNIFICANCE_KIND[page.significance] ?? "", text: significanceText(page.significance) };
const byUrl = (a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);

/**
 * 回の目次。違ったページ（`pages`）と同じだったページ（`unchanged`。v0.95.0 より前の capture-ledger には無い）を 1 列に。
 * 並びは重さの順で、同じ順の中は URL の順（要約の無い差分だけは、足した行と消した行の多い順）。
 * `id` は今回の WACZ の id（hash でページを名指す）。
 */
export const tocOf = (detail) => {
  const changed = (detail.pages ?? []).map((page) => ({
    id: page.after?.archiveId ?? page.before?.archiveId ?? null,
    url: page.url,
    same: false,
    rank: rankOf(page),
    size: page.added + page.removed,
    ...rowText(page),
    page,
  }));
  const same = (detail.unchanged ?? []).map((page) => ({
    id: page.after?.archiveId ?? page.before?.archiveId ?? null,
    url: page.url,
    same: true,
    rank: 6,
    size: 0,
    kind: "",
    text: t("changes.page.same"),
    page,
  }));
  return [...changed, ...same].sort(
    (a, b) => a.rank - b.rank || (a.rank === 4 ? b.size - a.size : 0) || byUrl(a, b),
  );
};

/**
 * 右に出す 1 行。名指しが目次に在ればそれ。無ければ「同じ」でない先頭（全部が同じなら undefined）。
 * 名指したのに無ければ `missing`（見てよくない WACZ・古い URL）。
 */
export const pickPage = (toc, pageId) => {
  const named = pageId === undefined ? undefined : toc.find((row) => row.id === pageId);
  if (named !== undefined) return { row: named, missing: false };
  return { row: toc.find((row) => !row.same), missing: pageId !== undefined };
};

/** 前と次のページと、何番目か（1 から）。「同じ」は飛ばす。「同じ」を開いているときは番号が無い。 */
export const neighborsOf = (toc, row) => {
  const changed = toc.filter((r) => !r.same);
  const i = row === undefined ? -1 : changed.indexOf(row);
  return {
    prev: i > 0 ? changed[i - 1] : undefined,
    next: i >= 0 && i + 1 < changed.length ? changed[i + 1] : undefined,
    index: i >= 0 ? i + 1 : undefined,
    total: changed.length,
  };
};

/** 引用を含む最初の足した行か消した行（`{ hunk, line }`）。無ければ undefined（照合で外れた引用）。 */
export const quoteLineOf = (hunks, quote) => {
  for (const [h, hunk] of hunks.entries()) {
    for (const [l, line] of hunk.entries()) {
      const sign = String(line).slice(0, 1);
      if ((sign === "+" || sign === "-") && String(line).slice(1).includes(quote)) return { hunk: h, line: l };
    }
  }
  return undefined;
};

/** 差分の行。先頭の記号（`-`・`+`・空白）と、その後の字に分ける。 */
export const hunkLines = (hunk) =>
  hunk.map((line) => {
    const sign = String(line).slice(0, 1);
    return { sign: sign === "-" || sign === "+" ? sign : " ", text: String(line).slice(1) };
  });

/** ページの見出しの字。前と今で BrowserHive の版が違えば添える。 */
export const versionNote = (page) => {
  const before = page.before?.browserhiveVersion ?? null;
  const after = page.after?.browserhiveVersion ?? null;
  return before !== null && after !== null && before !== after ? `BrowserHive ${before} → ${after}` : "";
};

/** 読み取りの失敗の字。404 は古い capture-ledger（変化のエンドポイントが無い）。 */
export const changesError = (status, body) =>
  status === 404 && body?.error !== "not found"
    ? t("changes.error.noRoute")
    : t("changes.error.statusSaid", { status: String(status), said: errorText(body) ?? t("changes.error.unreadable") });
