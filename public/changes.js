/**
 * 前回からの変化（CAPTURE-167）の、画面に依らない部分。capture-ledger の `GET /api/changes`・`GET /api/crawls/:id/changes`・
 * 予定の回の `change` を、字と色にするだけで、判定はしない —— 比べるのも重さを付けるのも capture-ledger（と Claude）。
 * ブラウザは `/changes.js` として読み、試験は `node --test` から import する。
 *
 * **要約は証拠ではない。** 回の要約には「Claude の要約（証拠ではない）」と model・prompt の版・費用を、ページの Claude の
 * 1 行には「証拠ではない」を必ず添える。正は 2 本の WACZ と差分で、差分は Claude なしで作った物。
 *
 * 回の詳細は、左に回の全ページの目次、右に選んだ 1 ページ（CAPTURE-236）。ページは今回の WACZ の id で名指す。
 */
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

/** 重さの字。 */
export const SIGNIFICANCE_TEXT = { none: "意味のある変化なし", minor: "小さい変化", content: "中身の変化" };

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
  const n = `${String(change.pagesChanged)} / ${String(change.pagesCompared)} ページ`;
  switch (change.state) {
    case "comparing":
      return { kind: "run", text: "比べています" };
    case "no_previous":
      return { kind: "", text: "初回（前の回が無い）" };
    case "unchanged":
      return { kind: "ok", text: `変化なし（${String(change.pagesCompared)} ページ）` };
    case "diffed":
      return { kind: "warn", text: `差分あり ${n}（要約なし）` };
    case "summarizing":
      return { kind: "run", text: `差分あり ${n}（要約しています）` };
    case "budget_wait":
      return { kind: "bad", text: `差分あり ${n}（要約が月の上限で止まっています）` };
    case "failed":
      return { kind: "bad", text: `差分あり ${n}（要約に失敗しました）` };
    case "summarized": {
      if (change.significance === null || change.significance === undefined) {
        return { kind: "", text: change.headline ?? "要約なし" };
      }
      return {
        kind: SIGNIFICANCE_KIND[change.significance] ?? "",
        text: `${SIGNIFICANCE_TEXT[change.significance] ?? change.significance}（${n}）`,
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
        ? `定期実行「${schedule.name}」: 前回からの変化の要約が、月の上限で止まっています`
        : `定期実行「${schedule.name}」: 前回からの変化の要約に失敗しました`,
    ];
  });

/** 要約の添え書き。**必ず**「証拠ではない」と言う。 */
export const summaryLine = (summary) =>
  summary === null || summary === undefined
    ? "要約はありません（差分だけ）"
    : `Claude の要約（証拠ではない）・${String(summary.model)}・${String(summary.promptVersion)}・$${Number(summary.usd).toFixed(4)}`;

/** ページの Claude の 1 行。**必ず**「証拠ではない」と言う。 */
export const pageClaudeLine = (headline) => `Claude の 1 行（証拠ではない）: ${String(headline)}`;

/**
 * 回の時刻の字（CAPTURE-235）。始まった時刻で言い、本来の時刻から 1 分以上遅れた回にだけ本来の時刻と遅れを添える。
 * 一覧の並びは始まった順なので、並びと字が食い違わない。
 */
export const runTimeText = (run, timeZone) => {
  const started = shortTime(run.startedAt, timeZone);
  const delay = runDelay(run);
  return delay === "" ? started : `${started}（本来 ${shortTime(run.scheduledFor, timeZone)}・${delay}）`;
};

/** 目次の並び（小さいほど上）。重さの順に、要約の無い差分、差分を作れなかったページ、同じだったページ。 */
const RANK = { content: 1, minor: 2, none: 3 };
const rankOf = (page) =>
  page.state === "prev_missing" ? 5 : (RANK[page.significance] ?? 4);
const rowText = (page) =>
  page.state === "prev_missing"
    ? { kind: "bad", text: "差分を作れなかった" }
    : page.significance === null || page.significance === undefined
      ? { kind: "", text: "差分あり（要約なし）" }
      : { kind: SIGNIFICANCE_KIND[page.significance] ?? "", text: SIGNIFICANCE_TEXT[page.significance] ?? page.significance };
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
    text: "同じ",
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
    ? "この capture-ledger は前回からの変化を返しません（v0.93.0 より前）"
    : `${String(status)} —— ${String(body?.error ?? body?.message ?? "読めませんでした")}`;
