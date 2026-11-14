/**
 * 数と状態の描き方。**workbench から切り出してあるのは、ここだけ試験から呼べるようにするため。**
 *
 * ブラウザは `/format.js` として読み、試験は `node --test` から import する ——
 * 同じファイルを両方が読むので、写しが腐ることがない。
 *
 * 字は辞書（`i18n/*.json`）に在り、ここは鍵を選んで `t()` に渡す（`i18n.js`）。
 */
import { t } from "./i18n.js";

/**
 * クロールの状態を、**言葉にする**。
 *
 * **`state` だけでは足りない。** `succeeded` は「1 枚以上撮れた」で（1 枚も撮れなければ capture-ledger が `failed` で
 * 締める。capture-ledger v0.77.0）、全部を辿った完走と、上限で切った打ち切りが混ざる。`max_depth`・`max_pages` が
 * 立つのは、まだ撮っていないリンクが残っていたときだけ（capture-ledger v0.83.0）。
 *
 * **辿るよう頼んだのにリンクが 1 本も無ければ「リンクなし」と言う**（capture-ledger の `no_links`。CAPTURE-245）。
 * 起点から 1 歩も進めなかったクロールを、緑の「完走」にしない —— frameset の頁は、これで 1 ページで黙って終わっていた。
 *
 * **深さ 0 のクロールは「このページだけ」と言う。** 辿らないと頼んだのだから、リンクが残っていても打ち切りでは
 * ない。行の `maxDepth` で決める。
 *
 * **全部を辿っても、取れなかったページがあれば緑にしない。** 数を添える（`pagesFailed`）。緑の「完走」は、
 * 頼んだ物が全部撮れたときだけ。知らない `stopReason` は、括弧に入れてそのまま見せる。
 */
export const stateOf = (crawl) => {
  if (crawl.state === "running") return { text: t("crawls.state.running"), kind: "run" };
  if (crawl.state !== "succeeded") return { text: t("crawls.state.failed"), kind: "bad" };
  const whole = crawl.pagesFailed === 0;
  /** 取れなかったページが在れば、状態の後ろに数を添える。 */
  const said = (state) => (whole ? state : t("crawls.state.withFailed", { state, n: crawl.pagesFailed }));
  if (crawl.maxDepth === 0) {
    return { text: said(t("crawls.state.pageOnly")), kind: whole ? "ok" : "warn" };
  }
  if (crawl.stopReason === "no_links") return { text: said(t("crawls.state.noLinks")), kind: "warn" };
  if (crawl.stopReason === "completed") {
    return { text: said(t("crawls.state.completed")), kind: whole ? "ok" : "warn" };
  }
  if (crawl.stopReason === "max_depth") return { text: said(t("crawls.state.maxDepth")), kind: "warn" };
  if (crawl.stopReason === "max_pages") return { text: said(t("crawls.state.maxPages")), kind: "warn" };
  return { text: said(t("crawls.state.other", { reason: String(crawl.stopReason) })), kind: "warn" };
};

/**
 * リンクの数（`pagesDiscovered`）。撮ったページのリンクのうち規則が通した別々の URL の数で、撮らなかった物も入る ——
 * 撮れた数の分母ではない。**1 枚も撮れていなければ数える物が無いので、`−` と書く**（0 と書くと「リンクが 0 本
 * だった」と読める）。
 */
export const linksOf = (crawl) => (crawl.pagesCaptured === 0 ? "−" : String(crawl.pagesDiscovered));

/**
 * リンクの数の但し書き。capture-ledger は、リンクを 1 本ずつ残したクロール（`linksRecorded`）の数を、規則が通した
 * **別々の URL の数**で返す。残す前のクロールは、段ごとに足した延べのまま（別の段で同じ URL が出ると 2 度数える）
 * なので、そう言う。数の無い行（`−`）と、欄の無い古い capture-ledger の答えには付けない。
 */
export const linksNoteOf = (crawl) =>
  crawl.linksRecorded === false && crawl.pagesCaptured > 0
    ? t("crawls.links.sumNote")
    : undefined;

/**
 * かかった時間。**走行中は「いままで」を出す** —— `finishedAt` が null なのは
 * 「まだ終わっていない」であって「時間が無い」ではない。
 *
 * @param {{ startedAt: string, finishedAt: string | null }} crawl
 * @param {number} now 試験が時刻を固定するために渡す。既定はいま。
 */
export const took = (crawl, now = Date.now()) => {
  const from = new Date(crawl.startedAt).getTime();
  const to = crawl.finishedAt === null ? now : new Date(crawl.finishedAt).getTime();
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 90) return `${String(seconds)}s`;
  return `${String(Math.floor(seconds / 60))}m ${String(seconds % 60)}s`;
};

/**
 * issue の severity を、画面の色に写す。
 *
 * **知らない severity を「問題なし」に倒さない。** 増えたものを黙って緑で出すと、
 * 検証器が新しく言い始めたことが画面から消える。
 */
export const severityKind = (severity) => {
  if (severity === "error") return "bad";
  if (severity === "warning") return "warn";
  if (severity === "info") return "muted";
  return "warn";
};

/**
 * 検証の結果を 1 行で。**合格だけを見せない** —— 警告 0 と警告 3 は別の状態で、
 * どちらも「失敗 0」だから。
 */
export const verdict = (summary) => {
  if (summary.failed > 0) return { text: t("archives.check.failed", { n: summary.failed }), kind: "bad" };
  if (summary.warnings > 0) return { text: t("archives.check.warnings", { n: summary.warnings }), kind: "warn" };
  return { text: t("archives.check.ok"), kind: "ok" };
};

/**
 * シークレットの値を WARC に残すか（宣言の `archive`）を、言葉にする。capture-ledger はクロールの行の答えに、宣言の写しを
 * `"keep"`（残す）か `null`（隠す）で返す（capture-ledger v0.90.0）。新しいクロールの画面の宣言も、`start.js` の
 * `declaredOf` が同じ形に揃える（宣言は省けば隠す）。どちらでも、値は capture-ledger・写し・ページの文字・ログには無い。
 *
 * 字は短く、何が起きるかは `title` で言う —— 開いた行の 1 行は、docs の絵の幅（632px）に収まる長さでないと切れる。
 *
 * **隠すのは BrowserHive v29.0.0 から。** それより前の BrowserHive は、通信に載せた値を WARC に残す —— capture-ledger は
 * そのころの行にも `null` を返すので、`title` で添える。`archive` を返さない capture-ledger（v0.89 まで）の行は undefined
 * （何も出さない）。知らない値は、隠す・残すのどちらにも倒さずにそのまま見せる（`severityKind` と同じ考え）。
 */
export const secretArchiveOf = (archive) => {
  if (archive === undefined) return undefined;
  if (archive === "keep") {
    return {
      text: t("crawls.secret.keep"),
      kind: "warn",
      title: t("crawls.secret.keepTitle"),
    };
  }
  if (archive === null) {
    return {
      text: t("crawls.secret.hide"),
      kind: "muted",
      title: t("crawls.secret.hideTitle"),
    };
  }
  return { text: `WARC: ${String(archive)}`, kind: "warn" };
};

/**
 * 覚えた検証の答えから、「仕様どおりか」の欄の結論を作る。まだ検証していなければ undefined（欄は空）。
 * 検証できなかった（Error）は「問題なし」と区別して言う。
 */
export const checkVerdict = (answer) => {
  if (answer === undefined) return undefined;
  if (answer instanceof Error) return { text: t("archives.check.unavailable"), kind: "bad" };
  return verdict(answer.summary);
};

/** 一覧に無い id を `map` から忘れる（引き直しで消えたアーカイブの答えを持ち続けない）。 */
export const forgetMissing = (map, ids) => {
  const keep = new Set(ids);
  for (const id of map.keys()) if (!keep.has(id)) map.delete(id);
};

/**
 * 報告がどの条件で作られたか —— どの build の検証器が、どの profile で見たか。
 *
 * **版は workbench が決めない。** daemon が報告に書いた `validatorVersion` をそのまま出す
 * （wacz-validator v0.31.0 からはタグの版。それより前の build は `0.0.0` と書く）。
 * workbench の検証を受ける daemon は自分では建て直らないので、古いまま動いていれば、
 * ここに出る版で分かる（capture-ledger の dev:status も、checkout と比べて言う）。
 */
export const judgedUnder = (report) => [
  `wacz-validator ${report.validatorVersion}`,
  `profile ${report.profile.name}`,
];

/**
 * 報告の統計を、1 行の部品に。**`stats` は best-effort で、無いことがある** ——
 * WARC が統計を取れないほど壊れていても、そう言う報告は出す (wacz-validator の約束)。
 * 以前は在るものとして読み、無い報告では検証の行ごと「検証できず」に落ちていた
 * (2026-09-26、wacz-validator の samples/wikipedia.wacz で実測)。報告が要るのは、
 * まさにそういう archive のほう。
 */
export const statsOf = (report) => {
  const stats = report.stats;
  if (stats === undefined) return [];
  const hosts = stats.hosts ?? [];
  return [
    t("archives.stats.records", { n: stats.warcRecordCount }),
    ...(hosts.length === 0 ? [] : [hosts.join(", ")]),
  ];
};

/** 数を 3 桁ずつ区切る（大きさの行・走らせたものの行・ページの表とログの行）。 */
export const count = (n) => n.toLocaleString("en-US");

/**
 * 一番新しい段を Windmill に投げた様子（capture-ledger の `dispatch`・CAPTURE-180）を、クロールの行と開いた所の言葉にする。
 * **1 回で受け取られた段には何も言わない。** 言うのは、送り直した（`attempts` が 2 以上）か、最後の誤りが残っているときだけ。
 * `attempts` は送った回数（受け取られた 1 回を含む）なので、送り直しはその 1 つ少ない数。諦めた段（`abandoned`）は、
 * 送り直しの数より先に「諦めた」と言う。`dispatch` の無い答え（段の行を入れる前の capture-ledger・前のクロール）は何も言わない。
 */
export const resendOf = (dispatch) => {
  if (dispatch === null || dispatch === undefined) return undefined;
  const resent = Math.max(0, dispatch.attempts - 1);
  if (resent === 0 && dispatch.lastError === null) return undefined;
  const text =
    dispatch.state === "abandoned" && dispatch.lastError !== null
      ? t("crawls.resend.abandoned", { depth: dispatch.depth, attempts: dispatch.attempts })
      : t("crawls.resend.resent", { depth: dispatch.depth, resent });
  const kind = dispatch.state === "abandoned" ? "bad" : "warn";
  return { text, kind, error: dispatch.lastError };
};

/**
 * URL を、一覧の欄の 2 行に分ける（CAPTURE-404）。上の行（`top`）は見分けに使う path と query、下の行
 * （`bottom`）は origin（scheme・host・port）。**字を足しも直しもしない** —— `bottom + top` は元の字と同じ
 * （`new URL` は host を小文字にし、既定の port を落とすので使わない）。
 *
 * path が無いか `/` だけの URL は、見分けに使うのが host なので、全文を上の行に出し、下の行は無い。
 * URL の形でない字（`urn:` など）も、そのまま上の行。
 */
const URL_SHAPE = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)(.*)$/is;
export const urlLinesOf = (text) => {
  const shape = URL_SHAPE.exec(text);
  if (shape === null || shape[2] === "" || shape[2] === "/") return { top: text, bottom: undefined };
  return { top: shape[2], bottom: shape[1] };
};
