/**
 * 数と状態の描き方。**workbench から切り出してあるのは、ここだけ試験から呼べるようにするため。**
 *
 * ブラウザは `/format.js` として読み、試験は `node --test` から import する ——
 * 同じファイルを両方が読むので、写しが腐ることがない。
 */

/**
 * クロールの状態を、**言葉にする**。
 *
 * **`state` だけでは足りない。** `succeeded` は「1 枚以上撮れた」で（1 枚も撮れなければ台帳が `failed` で
 * 締める。capture-ledger v0.77.0）、全部を辿った完走と、上限で切った打ち切りが混ざる。`max_depth`・`max_pages` が
 * 立つのは、まだ撮っていないリンクが残っていたときだけ（capture-ledger v0.83.0）。
 *
 * **深さ 0 のクロールは「このページだけ」と言う。** 辿らないと頼んだのだから、リンクが残っていても打ち切りでは
 * ない。行の `maxDepth` で決める。
 *
 * **全部を辿っても、取れなかったページがあれば緑にしない。** 数を添える（`pagesFailed`）。緑の「完走」は、
 * 頼んだ物が全部撮れたときだけ。知らない `stopReason` は、括弧に入れてそのまま見せる。
 */
export const stateOf = (crawl) => {
  if (crawl.state === "running") return { text: "走行中", kind: "run" };
  if (crawl.state !== "succeeded") return { text: "失敗", kind: "bad" };
  const short = crawl.pagesFailed > 0 ? `・${String(crawl.pagesFailed)} 枚取れず` : "";
  if (crawl.maxDepth === 0) {
    return { text: `このページだけ${short}`, kind: short === "" ? "ok" : "warn" };
  }
  if (crawl.stopReason === "completed") {
    return { text: `完走${short}`, kind: short === "" ? "ok" : "warn" };
  }
  if (crawl.stopReason === "max_depth") return { text: `打ち切り (深さ)${short}`, kind: "warn" };
  if (crawl.stopReason === "max_pages") return { text: `打ち切り (枚数)${short}`, kind: "warn" };
  return { text: `成功 (${String(crawl.stopReason)})${short}`, kind: "warn" };
};

/**
 * リンクの数（`pagesDiscovered`）。撮ったページのリンクのうち規則が通した本数で、撮らなかった物も入る ——
 * 撮れた数の分母ではない。**1 枚も撮れていなければ数える物が無いので、`−` と書く**（0 と書くと「リンクが 0 本
 * だった」と読める）。
 */
export const linksOf = (crawl) => (crawl.pagesCaptured === 0 ? "−" : String(crawl.pagesDiscovered));

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
  if (summary.failed > 0) return { text: `失敗 ${summary.failed}`, kind: "bad" };
  if (summary.warnings > 0) return { text: `警告 ${summary.warnings}`, kind: "warn" };
  return { text: "問題なし", kind: "ok" };
};

/**
 * 覚えた検証の答えから、「仕様どおりか」の欄の結論を作る。まだ検証していなければ undefined（欄は空）。
 * 検証できなかった（Error）は「問題なし」と区別して言う。
 */
export const checkVerdict = (answer) => {
  if (answer === undefined) return undefined;
  if (answer instanceof Error) return { text: "検証できず", kind: "bad" };
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
    `WARC ${String(stats.warcRecordCount)} レコード`,
    ...(hosts.length === 0 ? [] : [hosts.join(", ")]),
  ];
};

/** 数を 3 桁ずつ区切る（大きさの行・走らせたものの行・ページの表とログの行）。 */
export const count = (n) => n.toLocaleString("en-US");
