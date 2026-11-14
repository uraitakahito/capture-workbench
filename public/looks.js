/**
 * 一覧の行の「見た目」（CAPTURE-432）。capture-ledger が一覧の行に返す `screenshot`（読み込みの後の節目のスクリーンショット）
 * を、出す物の形にするだけ。DOM には触らない —— ブラウザは `/looks.js` として読み、試験は `node --test` から import する。
 * 使うのは、アーカイブの一覧（列「見た目」）と、クロールの行を開いたページの表（URL の欄の左）。
 *
 * capture-ledger の `screenshot` は 4 つの形（capture-ledger の `src/api/stage-screenshot.ts`）:
 *
 *   { stage, bytes }    絵が在る。`GET /api/archives/:id/screenshots/:stage` が WebP を返す
 *   { stage, skipped }  BrowserHive が残さなかった（理由は BrowserHive WACZ の `datapackage.json` のまま）
 *   { stage, problem }  欄は在るのに、WACZ の中の絵の位置を引けなかった
 *   null                記録が無い（絵の欄の無い WACZ・まだ検めていない WACZ・WACZ の無いページ）
 *
 * 古い capture-ledger は欄そのものを返さない（undefined）。そのときは何も出さない —— 「記録なし」と言うと、
 * capture-ledger が調べて無かったように読める。
 */
import { t } from "./i18n.js";
import { screenshotSkipText } from "./timeline.js";

/** 一覧に出す時点。capture-ledger が一覧の行に返すのも、この 1 つだけ。 */
export const LOOK_STAGE = "after-load";

/** 絵のエンドポイント（workbench の中継を通る `/api/*`。中継はこの形だけをバイト列のまま通す —— `src/lib.mjs`）。 */
export const lookSrc = (archiveId) =>
  `/api/archives/${encodeURIComponent(archiveId)}/screenshots/${LOOK_STAGE}`;

/** 残さなかった理由（`skipped`）の短い字。知らない理由と、撮ろうとして撮れなかった理由は「撮れず」。 */
const SKIP_WHY = {
  withheld: () => t("looks.why.withheld"),
  secret: () => t("looks.why.secret"),
  disabled: () => t("looks.why.disabled"),
};

const none = (why, title) => ({ kind: "none", why, title });

/**
 * 行の「見た目」。`archiveId` はその行の WACZ の id（ページの行では WACZ の無いとき null）。
 *
 *   undefined                    何も出さない（欄の無い capture-ledger・WACZ の無い行・形の違う値）
 *   { kind: "picture", src }     絵（`src` は中継の path）
 *   { kind: "none", why, title } 絵が無い。`why` は箱に出す短い字、`title` は指を乗せると出る全文
 *
 * **`skipped` が字なら、`bytes` が在っても絵にしない**（capture-ledger は skipped を先に見る。残さなかった時点の
 * 絵を引きに行かない）。
 */
export const lookOf = ({ screenshot, archiveId }) => {
  if (typeof archiveId !== "string" || archiveId === "") return undefined;
  if (screenshot === null) return none(t("looks.why.none"), t("looks.title.none"));
  // 欄の無い行（undefined）も、形の違う値と同じく何も出さない
  if (typeof screenshot !== "object" || typeof screenshot.stage !== "string") return undefined;
  if (typeof screenshot.skipped === "string") {
    return none(
      Object.hasOwn(SKIP_WHY, screenshot.skipped) ? SKIP_WHY[screenshot.skipped]() : t("looks.why.failed"),
      t("looks.title.skipped", { why: screenshotSkipText(screenshot.skipped) }),
    );
  }
  if (typeof screenshot.problem === "string") {
    return none(t("looks.why.problem"), t("looks.title.problem", { problem: screenshot.problem }));
  }
  if (typeof screenshot.bytes === "number") return { kind: "picture", src: lookSrc(archiveId) };
  return undefined;
};

/** 絵を引けなかった（`<img>` の error）ときの箱。作り直すたびに引き直さないよう、呼び手は覚えた要素をこれに替える。 */
export const lookUnreadable = () => none(t("looks.why.problem"), t("looks.title.unreadable"));

/**
 * 作った要素を、id で覚える（`map` は id → 要素）。**作るのは 1 度だけ** —— 表は引くたびに作り直す（2 秒か 30 秒ごと）
 * ので、作り直した `<img>` は絵を読み直して描き直す（capture-ledger の答えは `no-store` ではないが、作り直すたびに要素ごとに
 * 読みと decode が走る）。
 * 忘れるのは、呼び手が一覧から消えた id を落とす時（`format.js` の `forgetMissing`）。
 */
export const lookFor = (map, id, make) => {
  let made = map.get(id);
  if (made === undefined) {
    made = make();
    map.set(id, made);
  }
  return made;
};
