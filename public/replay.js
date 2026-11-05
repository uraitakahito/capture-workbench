/**
 * replay（ReplayWeb.page 2.5.0）への「replay ↗」の行き先。アーカイブの行と検索の当たりは WACZ 1 本を（CAPTURE-48）、
 * クロールの行とページの行はクロールの合本を開く（CAPTURE-54）。
 *
 * replay は、`?source=` だけで開くとページ一覧を出し、一覧を日付の新しい順に並べる。WACZ の `mainPageURL` は読まない。
 * BrowserHive v23 からの WACZ では、一覧に並ぶのは DOM の写し（`urn:browserhive:snapshot:…`）で、写しには頁の script が
 * 無い。JS が出し入れする絵（apple.com/jp のヒーローなど）は、写しでは出ない（CAPTURE-29）。だから取り込んだ URL を、
 * 撮った時刻で直に開く。写し（検索前・検索後）は、replay の Pages タブから開ける。
 */

/**
 * replay の server が保管庫へ中継する path（`/wacz/<鍵>`）。鍵は `/` で区切り、区切りごとに符号にして繋ぐ —— replay の
 * server（v0.3.0 から）は区切りごとに 1 度だけ解く（replay の docs/replay-bundle.md の「`/wacz/` の鍵の綴り」）。
 * BrowserHive はラベルを百分率の符号で鍵に入れる（`hello world` → `hello%20world`）ので、鍵の `%` も `%25` にする。
 * 鍵ごと 1 度に符号にすると、`/` が区切りでなくなる。
 */
const waczSourcePath = (key) => `/wacz/${String(key).split("/").map(encodeURIComponent).join("/")}`;

/**
 * replay を開く URL の hash の前まで（`<origin>/?source=…`）。`source` の値は `waczSourcePath` の path を、もう 1 度
 * query の値として符号にした物 —— replay（wabac）は `source` を 1 度解き、その path を自分の origin から引く。素の path を
 * 置くと、そこで 1 度解かれ、server がもう 1 度解いて、`%` を含む鍵が別の鍵になる。**どの「replay ↗」もこれで組む**
 * （WACZ 1 本も合本も。綴りはここだけ）。
 */
export const replaySourceHref = (origin, key) => `${origin}/?source=${encodeURIComponent(waczSourcePath(key))}`;

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
  const base = replaySourceHref(origin, objectKey);
  const ts = replayTs(capturedAt);
  if (typeof sourceUrl !== "string" || sourceUrl === "" || ts === undefined) return base;
  return `${base}#${new URLSearchParams({ view: "replay", url: sourceUrl, ts })}`;
};

/** 台帳が指す合本の鍵（`replayBundle.key`）。書けた版が無ければ（null の欄・失敗だけの欄・欄の無い台帳）undefined。 */
const bundleKeyOf = (replayBundle) => {
  const key = replayBundle?.key;
  return typeof key === "string" && key !== "" ? key : undefined;
};

/**
 * クロールの合本の「replay ↗」の行き先。合本は、台帳が段ごとに保管庫へ書く `replay.json`（と `pages.json`）で、replay は
 * クロールの WACZ を全部束ねた 1 つのアーカイブとして開く（リンクで別の WACZ のページへ行ける）。行き先が無ければ undefined
 * （link を出さない）。
 *
 * - **`source` は replay と同じ origin の path**（`/wacz/<鍵>`。replay の server が保管庫へ中継する）。replay は JSON の
 *   中の `resources[].path` と `pagesQueryUrl` を JSON の URL から解くので、ほかの origin の URL では引けない。綴りは
 *   WACZ 1 本と同じ（`replaySourceHref`）
 * - replay は `source` が `.json` で終わると合本（複数の WACZ）として開く（拡張子だけで決める）。台帳の鍵は
 *   `replay.json` で終わる
 * - ページの行を渡さなければ一覧（`#view=pages`）。渡せば、そのページを撮った時刻で合本の中で直に開く
 *   （`#view=replay&url=…&ts=…`）。ただしページの WACZ が台帳の指す版に入っているときだけ —— `bundledRev`（その WACZ が
 *   最初に入った版）が無いか、指す版より大きければ undefined（指す版の合本で開いても、replay は見つけられない）。URL か
 *   時刻が読めなければ一覧
 */
export const replayBundleHref = (origin, replayBundle, page) => {
  const key = bundleKeyOf(replayBundle);
  if (key === undefined) return undefined;
  if (page !== undefined && !(typeof page.bundledRev === "number" && page.bundledRev <= replayBundle.rev)) {
    return undefined;
  }
  const base = replaySourceHref(origin, key);
  const ts = replayTs(page?.capturedAt);
  if (typeof page?.url !== "string" || page.url === "" || ts === undefined) return `${base}#view=pages`;
  return `${base}#${new URLSearchParams({ view: "replay", url: page.url, ts })}`;
};

/**
 * 合本を書けなかった理由の 1 行（台帳の `replayBundle.error`。文は言い換えない）。失敗が無ければ undefined。台帳は指す版を
 * 前へだけ進め、失敗の理由は次に書けたら消す —— 書けた版が在れば、replay ↗ はその（前の）版を開く。
 */
export const replayBundleFailure = (replayBundle) => {
  const error = replayBundle?.error;
  if (typeof error !== "string" || error === "") return undefined;
  return bundleKeyOf(replayBundle) === undefined
    ? `合本を書けませんでした（replay で開ける版はまだありません）: ${error}`
    : `合本の新しい版を書けませんでした（replay ↗ は前の版 r${String(replayBundle.rev)} を開きます）: ${error}`;
};
