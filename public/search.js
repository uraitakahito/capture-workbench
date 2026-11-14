/**
 * 検索の画面（CAPTURE-53）の、画面に依らない部分。capture-ledger の全文検索（`GET /api/search?q=`）の答えを、行に組む形に
 * するだけで、並べ替えも言い換えもしない。ブラウザは `/search.js` として読み、試験は `node --test` から import する。
 *
 * capture-ledger は、WACZ のページ一覧（`pages/pages.jsonl`）の 1 行を索引の 1 件にする。写しの行がある BrowserHive WACZ では
 * 写しの行（`stage` が `after-load`・`after-behaviors`）だけを入れ、写しの無い取り込みは文書の行（`stage` が
 * null）を入れる（CAPTURE-48）。だから当たりは「アーカイブの 1 時点」で、同じアーカイブが時点ごとに並ぶ。
 * 返るのは見せてよいアーカイブの物だけ（capture-ledger が OpenFGA の can_view で絞る）。
 */
import { errorText, t } from "./i18n.js";
import { replaywebHref, replaywebSourceHref, replaywebTs } from "./replayweb.js";

/** 検索のエンドポイント。語はそのまま `q` に（capture-ledger は空を 400 で断る）。 */
export const searchPath = (words) => `/api/search?${new URLSearchParams({ q: words })}`;

/** 検索の画面の URL。`#search/<語>`（語が空なら `#search`）。 */
export const searchHash = (words) => (words === "" ? "#search" : `#search/${encodeURIComponent(words)}`);

/**
 * `#search` と `#search/<語>` を読む。検索の画面でなければ undefined、語が無ければ空文字。
 * 符号が壊れていても画面は開き、語は空にする（打ち直せばよい）。
 */
export const parseSearchHash = (hash) => {
  if (hash === "#search") return "";
  const m = /^#search\/(.*)$/s.exec(hash);
  if (m === null) return undefined;
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return "";
  }
};

/** 答えをそろえる。`hits` は配列、`total` は数（capture-ledger は見せてよい当たりの数を返す。無ければ行の数）。 */
export const answerOf = (body) => {
  const hits = Array.isArray(body?.hits) ? body.hits : [];
  return { hits, total: typeof body?.total === "number" ? body.total : hits.length };
};

/** 時点の名前。文書の行（`stage` が null）は「文書」。 */
export const stageLabel = (stage) =>
  typeof stage === "string" && stage !== "" ? stage : t("search.stage.document");

/**
 * OpenSearch が返す当たった所の断片を、文字と印に分ける。`<em>` と `</em>` だけを印の境として読み、
 * ほかは全部文字のまま（撮った中身は他人が書いたもの —— HTML として解かない）。印の中が空なら捨てる。
 */
export const highlightParts = (fragment) => {
  const parts = [];
  const text = String(fragment);
  let at = 0;
  for (const m of text.matchAll(/<em>([\s\S]*?)<\/em>/g)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), mark: false });
    if (m[1] !== "") parts.push({ text: m[1], mark: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
};

/**
 * 当たった行の再生の link の行き先。文書の行は取り込んだ URL を撮った時刻で直に開き（`replaywebHref`。頁の script も
 * 動く）、写しの行は写しの URI（`urn:browserhive:snapshot:<時点>:<文書の URL>`）を直に開く（script の無い DOM の
 * 写し）。写しの URI のレコードは 1 つなので、`ts` は撮った時刻でよい（replay がいちばん近い物を選ぶ）。
 */
export const hitReplaywebHref = (origin, hit) => {
  if (typeof hit?.stage !== "string" || hit.stage === "") return replaywebHref(origin, hit);
  const base = replaywebSourceHref(origin, hit.objectKey);
  const ts = replaywebTs(hit.capturedAt);
  if (typeof hit.url !== "string" || hit.url === "" || ts === undefined) return base;
  return `${base}#${new URLSearchParams({ view: "replay", url: hit.url, ts })}`;
};

/**
 * 引けなかったときの文。capture-ledger の文は `message` を先に（Fastify の 400 は `error` が「Bad Request」で、中身は
 * `message` に在る）。503 は OpenSearch が答えない、404 は capture-ledger に検索のエンドポイントが無い（設定の無い古い capture-ledger）。
 * 503 の句（`search unavailable`）は、辞書（`ledger.error.*`）に入れていない —— 答えが `message`（直す命令つき）も持ち、
 * 句を訳すと `errorText` がそこで止まって `message` が出なくなる。
 */
export const searchFailure = (status, body) => {
  const said = errorText(body) ?? t("common.noText");
  if (status === 0) return t("common.unreachable", { said });
  if (status === 503) return t("search.failure.unavailable", { said });
  if (status === 404) return t("search.failure.noEndpoint", { said });
  return `${String(status)} — ${said}`;
};
