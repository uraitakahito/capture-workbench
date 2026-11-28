/**
 * クロールの一覧の画面の URL（`public/crawls.js`）。開いた行と出どころの絞り込み。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { crawlsHref, parseCrawlsHref } from "../public/crawls.js";
import { isScreenPath } from "../public/paths.js";
import { ORIGIN_ALL, ORIGIN_SCHEDULE } from "../public/requester.js";

const CRAWL = "ece2e937-1b2c-4d3e-8f40-0123456789ab";

test("行と出どころを書いて読み戻すと同じ。「すべて」は from を書かない", () => {
  for (const [crawlId, from, href] of [
    [undefined, ORIGIN_ALL, "/crawls"],
    [CRAWL, ORIGIN_ALL, `/crawls/${CRAWL}`],
    [undefined, ORIGIN_SCHEDULE, "/crawls?from=schedule"],
    [CRAWL, "client:workbench", `/crawls/${CRAWL}?from=client%3Aworkbench`],
  ]) {
    assert.equal(crawlsHref(crawlId, from), href);
    assert.equal(isScreenPath(href), true, href);
    const [pathname, query = ""] = href.split("?");
    assert.deepEqual(parseCrawlsHref(pathname, query === "" ? "" : `?${query}`), { crawlId, known: true, from });
  }
});

test("ほかの query（?lang=）は見ない。一覧の画面でなければ undefined", () => {
  assert.deepEqual(parseCrawlsHref("/crawls", "?lang=en"), { crawlId: undefined, known: true, from: ORIGIN_ALL });
  assert.equal(parseCrawlsHref("/crawlsx", ""), undefined);
  assert.equal(parseCrawlsHref(`/crawls/${CRAWL}/x`, ""), undefined);
  assert.equal(parseCrawlsHref(`/links/${CRAWL}`, ""), undefined);
});

test("クロールの id の形でない行は known: false（capture-ledger に訊かずに「見つからない」）", () => {
  assert.deepEqual(parseCrawlsHref("/crawls/ece2e937", ""), { crawlId: "ece2e937", known: false, from: ORIGIN_ALL });
  assert.deepEqual(parseCrawlsHref("/crawls/%E6%97%A5", ""), { crawlId: "日", known: false, from: ORIGIN_ALL });
  assert.deepEqual(parseCrawlsHref("/crawls/%E6%97%", ""), { crawlId: "%E6%97%", known: false, from: ORIGIN_ALL });
  assert.equal(parseCrawlsHref(`/crawls/${CRAWL.toUpperCase()}`, "").known, false);
});
