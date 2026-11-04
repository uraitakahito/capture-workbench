/**
 * アーカイブの行の「replay ↗」の行き先（CAPTURE-48）。
 *
 * replay（ReplayWeb.page 2.5.0）は、`?source=` だけで開くとページ一覧を出し、一覧を日付の新しい順に
 * 並べる。WACZ の `mainPageURL` は読まない。BrowserHive v23 からの WACZ では、一覧に並ぶのは DOM の
 * 写し（`urn:browserhive:snapshot:…`）で、写しには頁の script が無い。JS が出し入れする絵（apple.com/jp の
 * ヒーローなど）は、写しでは出ない（CAPTURE-29）。だから取り込んだ URL を、撮った時刻で直に開く。
 * 写し（検索前・検索後）は、replay の Pages タブから開ける。
 */

/** 撮った時刻を、replay の `ts`（UTC の 14 桁 `YYYYMMDDhhmmss`）に。読めない時刻は undefined。 */
export const replayTs = (when) => {
  if (typeof when !== "string" || when === "") return undefined; // new Date(null) は 1970 年になる
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
};

/**
 * 「replay ↗」の行き先。取り込んだ URL（`sourceUrl`）と時刻（`capturedAt`）が在れば、その頁を直に開く
 * （`#view=replay&url=…&ts=…`）。どちらかが無ければ、いままでどおりページ一覧を開く。
 */
export const replayHref = (origin, { objectKey, sourceUrl, capturedAt }) => {
  const base = `${origin}/?source=/wacz/${encodeURIComponent(objectKey)}`;
  const ts = replayTs(capturedAt);
  if (typeof sourceUrl !== "string" || sourceUrl === "" || ts === undefined) return base;
  return `${base}#${new URLSearchParams({ view: "replay", url: sourceUrl, ts })}`;
};
