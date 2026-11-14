/**
 * 2 つの再生（replayweb-server の ReplayWeb.page 2.5.0 と、capture-player の Web Capture）への link の行き先。アーカイブの行と検索の当たりは WACZ 1 本を（CAPTURE-48）、
 * クロールの行とページの行はクロールの合本を開く（CAPTURE-54）。
 *
 * replay は、`?source=` だけで開くとページ一覧を出し、一覧を日付の新しい順に並べる。WACZ の `mainPageURL` は読まない。
 * BrowserHive v23 からの WACZ では、一覧に並ぶのは DOM の写し（`urn:browserhive:snapshot:…`）で、写しには頁の script が
 * 無い。JS が出し入れする絵（apple.com/jp のヒーローなど）は、写しでは出ない（CAPTURE-29）。だから取り込んだ URL を、
 * 撮った時刻で直に開く。写し（読み込みの後・スクリプトの後）は、replay の Pages タブから開ける。
 *
 * link の字と説明は辞書（`i18n/*.json`）に在る。再生の名前（ReplayWeb.page・Web Capture）は固有の名前なので、訳さない。
 */
import { t } from "./i18n.js";

/**
 * replayweb-server が保管庫へ中継する path（`/wacz/<鍵>`）。鍵は `/` で区切り、区切りごとに符号にして繋ぐ —— replayweb-server
 * （v0.3.0 から）は区切りごとに 1 度だけ解く（replayweb-server の docs/replay-bundle.md の「`/wacz/` の鍵の綴り」）。
 * BrowserHive はラベルを百分率の符号で鍵に入れる（`hello world` → `hello%20world`）ので、鍵の `%` も `%25` にする。
 * 鍵ごと 1 度に符号にすると、`/` が区切りでなくなる。
 */
const waczSourcePath = (key) => `/wacz/${String(key).split("/").map(encodeURIComponent).join("/")}`;

/**
 * ReplayWeb.page を開く URL の hash の前まで（`<origin>/?source=…`）。`source` の値は `waczSourcePath` の path を、もう 1 度
 * query の値として符号にした物 —— replay（wabac）は `source` を 1 度解き、その path を自分の origin から引く。素の path を
 * 置くと、そこで 1 度解かれ、server がもう 1 度解いて、`%` を含む鍵が別の鍵になる。**どの再生の link もこれで組む**
 * （WACZ 1 本も合本も。綴りはここだけ）。
 */
export const replaywebSourceHref = (origin, key) => `${origin}/?source=${encodeURIComponent(waczSourcePath(key))}`;

/** 撮った時刻を、replay の `ts`（UTC の 14 桁 `YYYYMMDDhhmmss`）に。読めない時刻は undefined。 */
export const replaywebTs = (when) => {
  if (typeof when !== "string" || when === "") return undefined; // new Date(null) は 1970 年になる
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
};

/**
 * 再生の link の行き先。取り込んだ URL（`sourceUrl`）と時刻（`capturedAt`）が在れば、その頁を直に開く
 * （`#view=replay&url=…&ts=…`）。どちらかが無ければ、いままでどおりページ一覧を開く。
 */
export const replaywebHref = (origin, { objectKey, sourceUrl, capturedAt }) => {
  const base = replaywebSourceHref(origin, objectKey);
  const ts = replaywebTs(capturedAt);
  if (typeof sourceUrl !== "string" || sourceUrl === "" || ts === undefined) return base;
  return `${base}#${new URLSearchParams({ view: "replay", url: sourceUrl, ts })}`;
};

/** capture-ledger が指す合本の鍵（`replayBundle.key`）。書けた版が無ければ（null の欄・失敗だけの欄・欄の無い capture-ledger）undefined。 */
const bundleKeyOf = (replayBundle) => {
  const key = replayBundle?.key;
  return typeof key === "string" && key !== "" ? key : undefined;
};

/**
 * クロールの合本の再生の link の行き先。合本は、capture-ledger が段ごとに保管庫へ書く `replay.json`（と `pages.json`）で、replay は
 * クロールの WACZ を全部束ねた 1 つのアーカイブとして開く（リンクで別の WACZ のページへ行ける）。行き先が無ければ undefined
 * （link を出さない）。
 *
 * - **`source` は replayweb-server と同じ origin の path**（`/wacz/<鍵>`。replayweb-server が保管庫へ中継する）。ReplayWeb.page は JSON の
 *   中の `resources[].path` と `pagesQueryUrl` を JSON の URL から解くので、ほかの origin の URL では引けない。綴りは
 *   WACZ 1 本と同じ（`replaywebSourceHref`）
 * - replay は `source` が `.json` で終わると合本（複数の WACZ）として開く（拡張子だけで決める）。capture-ledger の鍵は
 *   `replay.json` で終わる
 * - ページの行を渡さなければ一覧（`#view=pages`）。渡せば、そのページを撮った時刻で合本の中で直に開く
 *   （`#view=replay&url=…&ts=…`）。ただしページの WACZ が capture-ledger の指す版に入っているときだけ —— `bundledRev`（その WACZ が
 *   最初に入った版）が無いか、指す版より大きければ undefined（指す版の合本で開いても、replay は見つけられない）。URL か
 *   時刻が読めなければ一覧
 */
export const replayBundleHref = (origin, replayBundle, page) => {
  const key = bundleKeyOf(replayBundle);
  if (key === undefined) return undefined;
  if (page !== undefined && !(typeof page.bundledRev === "number" && page.bundledRev <= replayBundle.rev)) {
    return undefined;
  }
  const base = replaywebSourceHref(origin, key);
  const ts = replaywebTs(page?.capturedAt);
  if (typeof page?.url !== "string" || page.url === "" || ts === undefined) return `${base}#view=pages`;
  return `${base}#${new URLSearchParams({ view: "replay", url: page.url, ts })}`;
};

/**
 * クロールの行（一覧か詳しい所の答え）の合本が、途中の版か（CAPTURE-114）。途中の版には後の段で撮るページが入っていないので、
 * そのページへのリンクは replay で Not Found になる。走行中なら途中。終わった行は、指す版を書いた時刻（`builtAt`）が
 * 終わった時刻（`finishedAt`）より前なら途中 —— flow は report（ここでクロールが終わる）の後に replay_bundle（ここで最後の
 * 版を書く）を走らせるので、最後の版は少し遅れて届く。次の版を書けなかった行も、ここに入る。どちらの時刻も capture-ledger の時計。
 * 開ける版が無ければ false（link を出さない）。
 */
export const isPartialBundle = (crawl) => {
  if (bundleKeyOf(crawl.replayBundle) === undefined) return false;
  if (crawl.state === "running") return true;
  return Date.parse(crawl.replayBundle.builtAt) < Date.parse(crawl.finishedAt);
};

/** 終わった行の最後の版を待つ長さ。これを過ぎたら、来ないものとして速く引き直すのをやめる。 */
const FINAL_BUNDLE_WAIT_MS = 60_000;

/**
 * 終わったのに、最後の版がまだ見えていないか。見えるまで速く引き直す（`app.js` の `pace`）。走行中でなくなると引き直しは
 * 30 秒ごとになるので、待たないと、最後の版が書かれた後も古い版を開く link が残る。走行中の行は終わった時刻が無いので
 * 待たない（別に速く引いている）。capture-ledger が書けなかったと言っている行と、終わってから `FINAL_BUNDLE_WAIT_MS` を過ぎた行も待たない。
 */
export const awaitsFinalBundle = (crawl, now = Date.now()) => {
  const finished = Date.parse(crawl.finishedAt);
  if (Number.isNaN(finished) || now - finished >= FINAL_BUNDLE_WAIT_MS) return false;
  if (replayBundleFailure(crawl.replayBundle) !== undefined) return false;
  return bundleKeyOf(crawl.replayBundle) === undefined || isPartialBundle(crawl);
};

/**
 * 2 つの再生（CAPTURE-102）。どちらも同じ形の URL（`?source=/wacz/<鍵>#view=…`）を、違う origin に付ける。
 * `setting` は `/healthz` の欄の名前。並びは画面に出る順。
 * - ReplayWeb.page — replayweb-server。改変していない ReplayWeb.page（互換の再生）
 * - Web Capture — capture-player。ReplayWeb.page を改変し、BrowserHive WACZ Profile の足した物も見せる再生
 */
export const VIEWERS = [
  { setting: "replaywebServerOrigin", label: "ReplayWeb.page" },
  { setting: "capturePlayerOrigin", label: "Web Capture" },
];

/** 再生の link の字。 */
export const viewerText = (viewer) => `${viewer.label} ↗`;

/** クロールの行の合本の link の字。途中の版なら、番号と「途中」を言う。 */
export const replayBundleText = (crawl, viewer) =>
  isPartialBundle(crawl)
    ? t("crawls.bundle.partialLink", { viewer: viewer.label, rev: crawl.replayBundle.rev })
    : viewerText(viewer);

/** 途中の版の link に添える説明（title）。**関数** —— 字は、引くときの言語で辞書から引く（読み込みのときに決めない）。 */
export const partialBundleNote = () => t("crawls.bundle.partialNote");

/**
 * 合本を書けなかった理由の 1 行（capture-ledger の `replayBundle.error`。文は言い換えない）。失敗が無ければ undefined。capture-ledger は指す版を
 * 前へだけ進め、失敗の理由は次に書けたら消す —— 書けた版が在れば、再生の link はその（前の）版を開く。
 */
export const replayBundleFailure = (replayBundle) => {
  const error = replayBundle?.error;
  if (typeof error !== "string" || error === "") return undefined;
  return bundleKeyOf(replayBundle) === undefined
    ? t("crawls.bundle.neverWritten", { error })
    : t("crawls.bundle.newFailed", { rev: replayBundle.rev, error });
};
