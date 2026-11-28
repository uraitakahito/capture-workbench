/**
 * クロールの行を開いたときの「規則が何を決めたか」。capture-ledger の `GET /api/crawls/:id/decisions` の答えを
 * 数え直すだけで、判断は持たない（決めたのも残したのも capture-ledger）。ブラウザは `/decisions.js` として読み、
 * 試験は `node --test` から import する。
 */

/**
 * 規則ごとの数。**段を跨いで足す**（capture-ledger の行は段 × 規則 × ホスト名で、数はその段の別々の URL）。
 * 0 回の規則も行にする —— 当たらない規則は、書いた人の意図と違うことを言っている合図。どれにも
 * 当たらずに落とした物（規則 0）があれば、最後の行に。
 */
export const ruleTallies = (rules, decisions) => {
  const sum = (rule) =>
    decisions.filter((row) => row.rule === rule).reduce((n, row) => n + row.links, 0);
  const tallies = rules.map((rule, i) => {
    const [action, pattern] = Object.entries(rule)[0] ?? ["", ""];
    return { rule: i + 1, action, pattern, links: sum(i + 1) };
  });
  const unmatched = sum(0);
  return unmatched === 0 ? tallies : [...tallies, { rule: 0, action: "skip", pattern: "", links: unmatched }];
};

/**
 * 落とした物。規則で落とした物と、どれにも当たらなかった物と、robots.txt で取らなかったページを、
 * ホスト名ごとに（段を跨いで足し、例は最初の 1 本）。辿った物と撮るだけの物は入れない。
 *
 * robots.txt の行は、そのうち例外の行の上限で止まった数（`limited`。capture-ledger v0.117.0 から。`pages` に含まれる）が
 * 1 以上のときだけ、`limited` を持つ（0 と、欄の無い古い capture-ledger では持たない）。
 */
export const dropsOf = (decisions, robots) => {
  const rows = new Map();
  for (const row of decisions) {
    if (row.action !== "skip") continue;
    const key = `${String(row.rule)} ${row.hostname}`;
    const at = rows.get(key);
    if (at === undefined) {
      rows.set(key, { why: row.rule, hostname: row.hostname, links: row.links, sample: row.samples[0] ?? "" });
    } else {
      at.links += row.links;
    }
  }
  return [
    ...rows.values(),
    ...robots.map((row) => ({
      why: "robots",
      hostname: row.hostname,
      links: row.pages,
      sample: row.samples[0] ?? "",
      ...(row.limited > 0 && { limited: row.limited }),
    })),
  ];
};

/**
 * robots.txt が断ったが、例外の行で外して撮ったページ（答えの `robotsOverridden`。capture-ledger v0.117.0 から。
 * t-6bc6）。例外とホスト名ごとの行を、並びは capture-ledger のまま、例は最初の 1 本にする。**落とした物（`dropsOf`）には
 * 混ぜない** —— 撮った物なので。欄の無い答え（それより前の capture-ledger）は空。
 *
 * `pages` は撮れたページの数で、`failed` は外して撮りに行ったが撮れなかったページの数（`pages` には入らない）。
 * `failed` の無い行は 0 にする。
 */
export const overriddenOf = (robotsOverridden) =>
  (Array.isArray(robotsOverridden) ? robotsOverridden : []).map((row) => ({
    exemptionId: String(row.exemptionId),
    hostname: row.hostname,
    pages: row.pages,
    failed: typeof row.failed === "number" ? row.failed : 0,
    sample: row.samples?.[0] ?? "",
  }));

/**
 * Windmill の走らせる画面に、引数を入れて開く URL。**引数は hash に JSON で置く** —— Windmill（1.806）は
 * 走らせる画面の引数を `#<名前>=<JSON>` で持ち、開けばそれで埋まる（実測。query では埋まらない）。
 * id は全部を渡す（前の 8 字だと、同じ字で始まるクロールが 2 本あれば script が止まる）。
 */
export const inspectHref = (origin, workspace, crawlId) =>
  `${origin}/scripts/get/f/waggle/inspect_crawl?workspace=${encodeURIComponent(workspace)}` +
  `#crawl=${encodeURIComponent(JSON.stringify(crawlId))}`;
