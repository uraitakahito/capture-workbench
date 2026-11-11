/**
 * 前回からの変化（CAPTURE-167）の、画面に依らない部分。capture-ledger の `GET /api/changes`・`GET /api/crawls/:id/changes`・
 * 予定の回の `change` を、字と色にするだけで、判定はしない —— 比べるのも重さを付けるのも capture-ledger（と Claude）。
 * ブラウザは `/changes.js` として読み、試験は `node --test` から import する。
 *
 * **要約は証拠ではない。** Claude の 1 行には必ず「Claude の要約（証拠ではない）」と model・prompt の版・費用を添える。
 * 正は 2 本の WACZ と差分で、差分は Claude なしで作った物。
 */
export const CHANGES_PATH = "/api/changes";
export const changeDetailPath = (crawlId) => `/api/crawls/${encodeURIComponent(crawlId)}/changes`;

/** `#changes` と `#changes/<クロールの id>`。ほかは undefined。 */
export const parseChangesHash = (hash) => {
  if (hash === "#changes") return { crawlId: undefined };
  const m = /^#changes\/([0-9a-f-]{36})$/.exec(String(hash));
  return m === null ? undefined : { crawlId: m[1] };
};

/** 重さの字。 */
export const SIGNIFICANCE_TEXT = { none: "意味のある変化なし", minor: "小さい変化", content: "中身の変化" };

/** 重さの色。色の種類は `.state` の `ok`・`run`・`warn`・`bad`。中身の変化は目立たせる（悪いわけではないので bad にしない）。 */
const SIGNIFICANCE_KIND = { none: "ok", minor: "warn", content: "run" };

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
