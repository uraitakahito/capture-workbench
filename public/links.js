/**
 * クロールごとの「リンクの構成」の画面（`#links/<クロールの id>[/<ページの id>]`・CAPTURE-246）。capture-ledger の
 * `GET /api/crawls/:id/links` と `…/links/:page` の答えを、図に描く形にするだけで、数え直しも判断もしない
 * （どのリンクがどうなったかを決めて残したのは capture-ledger）。ここが決めるのは、URL の形・字・色の種類・
 * **図の配置**と、畳み方。DOM には触らない —— ブラウザは `/links.js` として読み、試験は `node --test` から import する。
 *
 * 字は辞書（`i18n/*.json`）に在り、ここは鍵を選んで `t()` に渡す（`i18n.js`）。
 */
import { t } from "./i18n.js";

const LINKS_HASH = /^#links\/([0-9a-f-]{36})(?:\/([0-9]{1,18}))?$/;

/** `#links/<クロールの id>[/<ページの id>]` を読む。違う形なら undefined。 */
export const parseLinksHash = (hash) => {
  const m = LINKS_HASH.exec(String(hash));
  return m === null ? undefined : { crawlId: m[1], pageId: m[2] };
};

/** `parseLinksHash` の逆。ページが無ければクロールだけ。 */
export const linksHash = (crawlId, pageId) =>
  pageId === undefined || pageId === null ? `#links/${crawlId}` : `#links/${crawlId}/${pageId}`;

/** クロール 1 本のリンクの構成のエンドポイント。 */
export const linksPath = (crawlId) => `/api/crawls/${encodeURIComponent(crawlId)}/links`;

/** 1 ページの出入りのリンクのエンドポイント。 */
export const pageLinksPath = (crawlId, pageId) =>
  `${linksPath(crawlId)}/${encodeURIComponent(pageId)}`;

/**
 * リンク 1 本がどうなったか（capture-ledger の `outcome`）の字と色の種類。並びは、画面に出す順。
 * 字は、引くときに辞書から読む関数（読み込みのときには言語がまだ決まっていない）。
 * 色の種類は `.state` と同じ名前（ok・content・run・depth・muted）で、知らない値は字をそのまま、色は run。
 */
export const OUTCOMES = [
  ["followed", () => t("links.outcome.followed"), "ok"],
  ["known", () => t("links.outcome.known"), "content"],
  ["max_pages", () => t("links.outcome.maxPages"), "run"],
  ["max_depth", () => t("links.outcome.maxDepth"), "depth"],
  ["closed", () => t("links.outcome.closed"), "muted"],
  ["skip", () => t("links.outcome.skip"), "muted"],
  ["nofollow", () => t("links.outcome.nofollow"), "muted"],
];
const OUTCOME = new Map(OUTCOMES.map(([key, text, kind]) => [key, { text, kind }]));

export const linkOutcomeOf = (outcome) => {
  const known = OUTCOME.get(outcome);
  return known === undefined ? { text: String(outcome), kind: "run" } : { text: known.text(), kind: known.kind };
};

/** ページごとの数（`pages[].out`）の鍵 → `outcome`。 */
export const OUT_KEYS = [
  ["followed", "followed"],
  ["known", "known"],
  ["maxPages", "max_pages"],
  ["maxDepth", "max_depth"],
  ["closed", "closed"],
  ["skip", "skip"],
  ["nofollow", "nofollow"],
];

/**
 * 数の内訳の帯。`summary` は「見つけた別々の URL（起点を除く）がどうなったか」で、0 の物は出さない。
 * 取れなかったページと見送ったページは 1 つにまとめる（どちらも「行はできたが撮れていない」）。
 * `nofollow` は規則を当てていないので、帯に入れずに `aside` で言う。
 */
export const splitOf = (summary) => {
  if (summary === null || summary === undefined) return { parts: [], total: 0, aside: undefined };
  const parts = [
    { key: "captured", text: t("links.split.captured"), kind: "ok", n: summary.captured },
    { key: "unfinished", text: t("links.split.unfinished"), kind: "bad", n: summary.failed + summary.skipped },
    { key: "pending", text: t("links.split.pending"), kind: "accent", n: summary.pending },
    { key: "max_pages", text: t("links.outcome.maxPages"), kind: "run", n: summary.maxPages },
    { key: "max_depth", text: t("links.outcome.maxDepth"), kind: "depth", n: summary.maxDepth },
    { key: "closed", text: t("links.outcome.closed"), kind: "muted", n: summary.closed },
    { key: "skip", text: t("links.split.skip", { hosts: summary.hosts }), kind: "muted", n: summary.skip },
  ].filter((part) => part.n > 0);
  return {
    parts,
    total: parts.reduce((n, part) => n + part.n, 0),
    aside: summary.nofollow > 0 ? t("links.split.nofollow", { n: summary.nofollow }) : undefined,
  };
};

/** ページの結末（capture-ledger の `state`）の色の種類。知らない値は run。 */
export const pageKind = (state) =>
  ({ captured: "ok", failed: "bad", skipped: "muted", pending: "accent" })[state] ?? "run";

/** 図の箱に書く字。起点と同じ origin なら path から、違えば URL のまま。`max` 字で切る。 */
export const boxLabelOf = (url, origin, max) => {
  const text = origin !== undefined && url.startsWith(`${origin}/`) ? url.slice(origin.length) : url;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** 起点の origin（最初の起点のページの URL から）。読めなければ undefined。 */
export const originOf = (graph) => {
  const root = graph.pages.find((page) => page.parent === null);
  try {
    return root === undefined ? undefined : new URL(root.url).origin;
  } catch {
    return undefined;
  }
};

/** 答えを引きやすい形に。`kids` は親 → 子（入った順）、`bundles` は見つけたページ → 束。 */
export const indexOf = (graph) => {
  const byId = new Map(graph.pages.map((page) => [page.id, page]));
  const kids = new Map();
  const roots = [];
  for (const page of graph.pages) {
    // 親の行がこのクロールに無ければ（来ないはずだが）、起点と同じ列に置いて落とさない
    if (page.parent === null || !byId.has(page.parent)) roots.push(page.id);
    else kids.set(page.parent, [...(kids.get(page.parent) ?? []), page.id]);
  }
  const bundles = new Map();
  for (const bundle of graph.bundles ?? []) {
    bundles.set(bundle.from, [...(bundles.get(bundle.from) ?? []), bundle]);
  }
  return { byId, kids, roots, bundles };
};

/** そのページの下に在るページの数（子・孫…）。 */
export const descendantsOf = (index, id) =>
  (index.kids.get(id) ?? []).reduce((n, kid) => n + 1 + descendantsOf(index, kid), 0);

/**
 * 図の寸法。列（深さ）の幅と間、行の高さ、箱の高さ。列 3 本（深さ 0・1 と、その先の束）が docs の本文の幅
 * （632）に収まる寸法にしてある。
 */
export const SIZE = { col: 160, gap: 48, row: 22, node: 17, left: 12, top: 32, bottom: 40 };

/** 深さ `depth` の列の左端。 */
export const colX = (depth) => SIZE.left + depth * (SIZE.col + SIZE.gap);

/** 束を並べる順（枚数 → 深さ → 締まっていた）。 */
const BUNDLE_ORDER = ["max_pages", "max_depth", "closed"];

/**
 * 図の配置。**木を上から順に置く**: 葉が 1 行ずつ取り、親は子の真ん中に来る。木の辺は交わらない。
 * 畳んだページ（`collapsed`）は葉になり、下のページも束も出さない。束（撮らなかった URL を、最初に見つけた
 * ページと理由でまとめた箱）は、そのページの子の後ろに、1 つ深い列に置く。
 *
 * 返す `rows` は箱（`kind` が `page` か `bundle`）で、`y` は箱の上端。`height` は図の高さ、`depth` は一番深い列。
 */
export const layoutOf = (graph, collapsed = new Set()) => {
  const index = indexOf(graph);
  const rows = [];
  let slot = 0;
  const leaf = () => SIZE.top + slot++ * SIZE.row;
  const place = (id) => {
    const page = index.byId.get(id);
    const kids = index.kids.get(id) ?? [];
    const bundles = [...(index.bundles.get(id) ?? [])].sort(
      (a, b) => BUNDLE_ORDER.indexOf(a.outcome) - BUNDLE_ORDER.indexOf(b.outcome),
    );
    const folded = collapsed.has(id) && kids.length + bundles.length > 0;
    const ys = [];
    if (!folded) {
      for (const kid of kids) ys.push(place(kid));
      for (const bundle of bundles) {
        const y = leaf();
        rows.push({
          kind: "bundle",
          key: `${id}:${bundle.outcome}`,
          from: id,
          outcome: bundle.outcome,
          urls: bundle.urls,
          depth: page.depth + 1,
          y,
        });
        ys.push(y);
      }
    }
    const y = ys.length === 0 ? leaf() : (ys[0] + ys[ys.length - 1]) / 2;
    rows.push({
      kind: "page",
      key: id,
      id,
      depth: page.depth,
      y,
      folded,
      // 畳める物が在るか（子か束）と、畳んだときに隠れるページの数
      foldable: kids.length + bundles.length > 0,
      hidden: folded ? descendantsOf(index, id) : 0,
    });
    return y;
  };
  for (const root of index.roots) place(root);
  return {
    rows,
    height: SIZE.top + slot * SIZE.row + SIZE.bottom,
    depth: rows.reduce((max, row) => Math.max(max, row.depth), 0),
  };
};

/** 行がこれを超える図は、開いたときに深さ 1 より下を畳んで出す。 */
export const ROWS_OPEN = 60;

/**
 * 開いたときに畳んでおくページ。全部を開いた図の行が `ROWS_OPEN` を超えるときだけ、深さ 1 以上で子を持つ
 * ページを畳む（起点は畳まない —— 畳むと箱が 1 つになる）。超えなければ空。
 */
export const foldedAtOpen = (graph) => {
  if (layoutOf(graph).rows.length <= ROWS_OPEN) return new Set();
  const index = indexOf(graph);
  return new Set(
    graph.pages
      .filter((page) => page.depth >= 1 && (index.kids.get(page.id) ?? []).length > 0)
      .map((page) => page.id),
  );
};

/** 深さ 1 以上で、子か束を持つページ（「深さ 1 より下を畳む」が畳む物）。 */
export const foldableBelowSeeds = (graph) => {
  const index = indexOf(graph);
  return graph.pages
    .filter(
      (page) =>
        page.depth >= 1 &&
        (index.kids.get(page.id) ?? []).length + (index.bundles.get(page.id) ?? []).length > 0,
    )
    .map((page) => page.id);
};

/**
 * 図に描く木に無い辺（もう行があるページへのリンク）。`all` なら全部、違えば選んだページ（`selected`）に
 * 触れる物だけ。両端が図に見えている物だけを返す（畳んだ下のページへは描かない）。
 */
export const crossOf = (graph, layout, selected, all) => {
  const seen = new Set(layout.rows.filter((row) => row.kind === "page").map((row) => row.id));
  return (graph.cross ?? []).filter(
    ([from, to]) =>
      seen.has(from) && seen.has(to) && (all || from === selected || to === selected),
  );
};

/** 選んだページの出るリンクを、どうなったかごとに（`OUTCOMES` の順。0 本の物は出さない）。 */
export const groupsOf = (out) =>
  OUTCOMES.map(([key]) => ({
    outcome: key,
    ...linkOutcomeOf(key),
    links: out.filter((link) => link.outcome === key),
  })).filter((group) => group.links.length > 0);
