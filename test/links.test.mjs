import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROWS_OPEN,
  SIZE,
  colX,
  crossOf,
  descendantsOf,
  foldableBelowSeeds,
  foldedAtOpen,
  groupsOf,
  indexOf,
  boxLabelOf,
  layoutOf,
  linksHash,
  linksPath,
  originOf,
  linkOutcomeOf,
  pageKind,
  pageLinksPath,
  parseLinksHash,
  splitOf,
} from "../public/links.js";

const CRAWL = "a0278294-be68-4676-a9de-f200c680682a";
const page = (id, parent, depth, path = `/p/${id}`, state = "captured") => ({
  id,
  parent,
  depth,
  url: `https://site.test${path}`,
  title: null,
  state,
  reason: null,
  out: null,
  in: null,
});
// 起点 1 → 子 2・3。2 の下に 4・5。3 は枚数で 2 本切り、5 は深さで 1 本切った
const GRAPH = {
  crawlId: CRAWL,
  recorded: true,
  pages: [page("1", null, 0, "/"), page("2", "1", 1), page("3", "1", 1), page("4", "2", 2), page("5", "2", 2)],
  bundles: [
    { from: "3", outcome: "max_pages", urls: 2 },
    { from: "5", outcome: "max_depth", urls: 1 },
  ],
  cross: [
    ["4", "1"],
    ["3", "2"],
  ],
};

test("URL の形: クロールだけ・ページつき・違う形", () => {
  assert.deepEqual(parseLinksHash(`#links/${CRAWL}`), { crawlId: CRAWL, pageId: undefined });
  assert.deepEqual(parseLinksHash(`#links/${CRAWL}/757`), { crawlId: CRAWL, pageId: "757" });
  assert.equal(parseLinksHash("#links"), undefined);
  assert.equal(parseLinksHash(`#links/${CRAWL}/abc`), undefined);
  assert.equal(parseLinksHash(`#crawls/${CRAWL}`), undefined);
  assert.equal(linksHash(CRAWL), `#links/${CRAWL}`);
  assert.equal(linksHash(CRAWL, "757"), `#links/${CRAWL}/757`);
  assert.deepEqual(parseLinksHash(linksHash(CRAWL, "757")), { crawlId: CRAWL, pageId: "757" });
});

test("エンドポイントの path", () => {
  assert.equal(linksPath(CRAWL), `/api/crawls/${CRAWL}/links`);
  assert.equal(pageLinksPath(CRAWL, "757"), `/api/crawls/${CRAWL}/links/757`);
});

test("どうなったかの字と色。知らない値は字をそのまま出す", () => {
  assert.deepEqual(linkOutcomeOf("max_pages"), { text: "枚数で切った", kind: "run" });
  assert.deepEqual(linkOutcomeOf("max_depth"), { text: "深さで切った", kind: "depth" });
  assert.deepEqual(linkOutcomeOf("later"), { text: "later", kind: "run" });
  assert.equal(pageKind("captured"), "ok");
  assert.equal(pageKind("skipped"), "muted");
  assert.equal(pageKind("later"), "run");
});

test("内訳の帯: 0 の物は出さず、取れなかった物と見送った物は 1 つに、nofollow は帯の外", () => {
  const split = splitOf({
    pending: 0,
    captured: 29,
    failed: 1,
    skipped: 2,
    maxPages: 28,
    maxDepth: 3,
    closed: 0,
    skip: 69,
    nofollow: 4,
    hosts: 17,
  });
  assert.deepEqual(
    split.parts.map((part) => [part.key, part.n]),
    [
      ["captured", 29],
      ["unfinished", 3],
      ["max_pages", 28],
      ["max_depth", 3],
      ["skip", 69],
    ],
  );
  assert.equal(split.total, 132);
  assert.equal(split.parts.at(-1).text, "規則で落とした（17 個のホスト）");
  assert.equal(split.aside, "ほかに nofollow で外した 4 本");
});

test("内訳の無い答え（記録の無いクロール）は、帯を出さない", () => {
  assert.deepEqual(splitOf(null), { parts: [], total: 0, aside: undefined });
});

test("箱の字: 起点と同じ origin は path から、違えば URL のまま、長ければ切る", () => {
  assert.equal(originOf(GRAPH), "https://site.test");
  assert.equal(boxLabelOf("https://site.test/movie/eiga.htm", "https://site.test", 30), "/movie/eiga.htm");
  assert.equal(boxLabelOf("https://other.test/x", "https://site.test", 30), "https://other.test/x");
  assert.equal(boxLabelOf("https://site.test/abcdefghij", "https://site.test", 8), "/abcdef…");
  assert.equal(boxLabelOf("https://site.testing/x", "https://site.test", 40), "https://site.testing/x");
});

test("木の形: 親 → 子と、下に在るページの数", () => {
  const index = indexOf(GRAPH);
  assert.deepEqual(index.roots, ["1"]);
  assert.deepEqual(index.kids.get("1"), ["2", "3"]);
  assert.equal(descendantsOf(index, "1"), 4);
  assert.equal(descendantsOf(index, "2"), 2);
  assert.equal(descendantsOf(index, "3"), 0);
});

test("親の行が無いページは、起点と同じ列に置いて落とさない", () => {
  const index = indexOf({ pages: [page("1", null, 0), page("9", "404", 1)], bundles: [] });
  assert.deepEqual(index.roots, ["1", "9"]);
});

test("配置: 葉が 1 行ずつ取り、親は子の真ん中、束は 1 つ深い列", () => {
  const { rows, height, depth } = layoutOf(GRAPH);
  const at = Object.fromEntries(rows.map((row) => [row.key, row]));
  // 葉の順: 4・5 の束・(5 は束を持つので葉でない)…… 上から 4, 5:max_depth, 3:max_pages
  assert.equal(at["4"].y, SIZE.top);
  assert.equal(at["5:max_depth"].y, SIZE.top + SIZE.row);
  assert.equal(at["3:max_pages"].y, SIZE.top + 2 * SIZE.row);
  // 5 は束の真横、2 は 4 と 5 の真ん中、3 は束の真横、1 は 2 と 3 の真ん中
  assert.equal(at["5"].y, at["5:max_depth"].y);
  assert.equal(at["2"].y, (at["4"].y + at["5"].y) / 2);
  assert.equal(at["3"].y, at["3:max_pages"].y);
  assert.equal(at["1"].y, (at["2"].y + at["3"].y) / 2);
  assert.equal(at["5:max_depth"].depth, 3);
  assert.equal(at["3:max_pages"].depth, 2);
  assert.equal(depth, 3);
  assert.equal(height, SIZE.top + 3 * SIZE.row + SIZE.bottom);
  assert.equal(colX(0), SIZE.left);
  assert.equal(colX(2), SIZE.left + 2 * (SIZE.col + SIZE.gap));
});

test("畳んだページは葉になり、下のページも束も出さない。隠れた数を言う", () => {
  const { rows } = layoutOf(GRAPH, new Set(["2"]));
  const keys = rows.map((row) => row.key);
  assert.deepEqual(keys.sort(), ["1", "2", "3", "3:max_pages"]);
  const two = rows.find((row) => row.key === "2");
  assert.equal(two.folded, true);
  assert.equal(two.hidden, 2);
  assert.equal(two.y, SIZE.top);
});

test("子も束も無いページは、畳む物が無い", () => {
  const { rows } = layoutOf(GRAPH, new Set(["4"]));
  const four = rows.find((row) => row.key === "4");
  assert.equal(four.foldable, false);
  assert.equal(four.folded, false);
  assert.equal(rows.length, 7);
});

test("束だけを持つページも畳める", () => {
  const { rows } = layoutOf(GRAPH, new Set(["3"]));
  assert.equal(rows.some((row) => row.key === "3:max_pages"), false);
  assert.equal(rows.find((row) => row.key === "3").folded, true);
});

test("行が多い図は、開いたときに深さ 1 より下を畳む。少なければ畳まない", () => {
  assert.deepEqual([...foldedAtOpen(GRAPH)], []);
  // 起点の下に 10 ページ、その各々に 6 ページ: 行は 60 を超える
  const pages = [page("1", null, 0, "/")];
  for (let i = 0; i < 10; i += 1) {
    pages.push(page(`a${i}`, "1", 1));
    for (let j = 0; j < 6; j += 1) pages.push(page(`a${i}b${j}`, `a${i}`, 2));
  }
  const wide = { pages, bundles: [] };
  assert.ok(layoutOf(wide).rows.length > ROWS_OPEN);
  const folded = foldedAtOpen(wide);
  assert.equal(folded.size, 10);
  assert.equal(folded.has("1"), false);
  // 畳むと、起点と深さ 1 の 10 ページだけ
  assert.equal(layoutOf(wide, folded).rows.length, 11);
});

test("「深さ 1 より下を畳む」は、深さ 1 以上で子か束を持つページを畳む（起点は畳まない）", () => {
  assert.deepEqual(foldableBelowSeeds(GRAPH).sort(), ["2", "3", "5"]);
});

test("木に無い辺: 選んだページに触れる物だけ。全部出すなら全部。畳んだ下へは描かない", () => {
  const open = layoutOf(GRAPH);
  assert.deepEqual(crossOf(GRAPH, open, "2", false), [["3", "2"]]);
  assert.deepEqual(crossOf(GRAPH, open, "1", false), [["4", "1"]]);
  assert.deepEqual(crossOf(GRAPH, open, null, false), []);
  assert.equal(crossOf(GRAPH, open, null, true).length, 2);
  // 2 を畳むと 4 は見えないので、4 → 1 は描かない
  assert.deepEqual(crossOf(GRAPH, layoutOf(GRAPH, new Set(["2"])), null, true), [["3", "2"]]);
});

test("選んだページの出るリンクは、どうなったかごとに、決まった順で。0 本の物は出さない", () => {
  const groups = groupsOf([
    { seq: 0, url: "https://site.test/a", outcome: "max_pages" },
    { seq: 1, url: "https://site.test/b", outcome: "followed" },
    { seq: 2, url: "https://site.test/c", outcome: "max_pages" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.outcome, group.text, group.links.length]),
    [
      ["followed", "次の段に入れた", 1],
      ["max_pages", "枚数で切った", 2],
    ],
  );
});
