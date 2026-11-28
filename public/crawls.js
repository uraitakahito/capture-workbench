/**
 * クロールの一覧の画面の URL（`/crawls[/<クロールの id>][?from=<出どころ>]`）。開いた行（1 本）と、出どころの絞り込み
 * （`requester.js` の鍵）を URL に載せる —— URL を送れば、相手も同じ行が開き、同じ絞り込みで並ぶ。
 * DOM に触らない —— ブラウザは `/crawls.js` として読み、試験は `node --test` から import する。
 */
import { ORIGIN_ALL } from "./requester.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/crawls`・`/crawls/<id>` と `?from=` を読む（`pathname` と `search` は `location` の 2 つ）。一覧の画面でなければ
 * undefined。id がクロールの id の形（uuid）でなければ `known: false`（capture-ledger に訊かずに「見つからない」）。
 * 大文字で書いた id も同じクロール（Postgres の uuid は大文字小文字を問わない）なので、小文字にそろえる。
 */
export const parseCrawlsHref = (pathname, search = "") => {
  const m = /^\/crawls(?:\/([^/]+))?$/.exec(pathname);
  if (m === null) return undefined;
  let crawlId = m[1];
  if (crawlId !== undefined) {
    try {
      crawlId = decodeURIComponent(crawlId);
    } catch {
      // 壊れた符号。字のまま「見つからない」に出す
    }
  }
  const known = crawlId === undefined || UUID.test(crawlId);
  return {
    crawlId: known && crawlId !== undefined ? crawlId.toLowerCase() : crawlId,
    known,
    from: new URLSearchParams(search).get("from") ?? ORIGIN_ALL,
  };
};

/** `parseCrawlsHref` の逆。行が無ければ一覧だけ、出どころが「すべて」なら `from` を書かない。 */
export const crawlsHref = (crawlId, from = ORIGIN_ALL) => {
  const path = crawlId === undefined ? "/crawls" : `/crawls/${encodeURIComponent(crawlId)}`;
  return from === ORIGIN_ALL ? path : `${path}?${new URLSearchParams({ from })}`;
};
