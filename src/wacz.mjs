/**
 * WACZ の中身を読むエンドポイント。`/wacz/<archiveId>/<op>` を読み、capture-ledger に署名をもらい、daemon に渡す。
 *
 * 6 本とも同じ 2 段 —— **capture-ledger に署名をもらう → daemon に渡す** —— で、署名はこの
 * ファイルの外に出ない。workbench が呼ぶのは GET（`<img src>` も GET）で、daemon へは
 * POST に組み替える。`/api/` は capture-ledger の素通しだけに戻した（server.mjs 自身が
 * 「こちらの答えを混ぜない」と書いているので、daemon 行きのエンドポイントはここに集める）。
 *
 *   POST /wacz/<id>/validate                              → POST /validate
 *   GET  /wacz/<id>/lines?path=&from=&count=              → POST /lines
 *   GET  /wacz/<id>/line?path=&n=                         → POST /line
 *   GET  /wacz/<id>/records?path=&from=&count=            → POST /records
 *   GET  /wacz/<id>/record?path=&offset=&length=          → POST /record
 *   GET  /wacz/<id>/record/body?path=&offset=&length=     → POST /record/body（bytes）
 *
 * ここに在るのは経路の読みと組み替えだけ。**workbench のロジックは置かない。**
 */
import { Told } from "./lib.mjs";

/** workbench が組み立てた引数が足りない・数でない。400 で返す。句と値は `lib.mjs` の `ERROR_PHRASES`。 */
export class BadRequest extends Told {
  constructor(phrase, params) {
    super(phrase, params);
    this.name = "BadRequest";
  }
}

/** 検証の報告の言語。daemon（wacz-validator）が辞書を持つ言語のうち、画面が持つ物。 */
export const LOCALES = Object.freeze(["ja", "en"]);

/**
 * daemon へ行くエンドポイントの名前。**docs の「エンドポイント」の表は、これと突き合わされる**
 * (scripts/check-doc-refs.mjs)。エンドポイントを足すときは、ここと paramsFor と docs の表の 3 か所。
 */
export const OPS = Object.freeze(["validate", "lines", "line", "records", "record", "record/body"]);

const ROUTE = new RegExp(`^/wacz/([^/?]+)/(${OPS.join("|")})(?:\\?(.*))?$`);

/**
 * `/wacz/<archiveId>/<op>?…` を読む。合わなければ undefined。
 * 数は数に（無ければ undefined、数でなければ NaN —— paramsFor が断る）、path は decode して返す。
 * `locale` は検証（validate）だけが使う、報告の言語。
 */
export const parseWaczRoute = (url) => {
  const m = ROUTE.exec(url);
  if (m === null) return undefined;
  let archiveId;
  try {
    archiveId = decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
  const q = new URLSearchParams(m[3] ?? "");
  const num = (name) => (q.has(name) ? Number(q.get(name)) : undefined);
  const path = q.get("path");
  const locale = q.get("locale");
  return {
    archiveId,
    op: m[2],
    params: {
      path: path === null || path === "" ? undefined : path,
      from: num("from"),
      count: num("count"),
      n: num("n"),
      offset: num("offset"),
      length: num("length"),
      locale: locale === null || locale === "" ? undefined : locale,
    },
  };
};

/**
 * op ごとに daemon へ渡す引数（source を除く）を組む。足りなければ BadRequest。
 * **署名をもらう前に検査する** —— 引数が壊れているのに capture-ledger へ行かない。
 */
export const paramsFor = (op, params) => {
  const need = (name) => {
    const value = params[name];
    if (value === undefined || Number.isNaN(value)) throw new BadRequest("parameter required", { name });
    return value;
  };
  switch (op) {
    case "validate": {
      // 報告の文は daemon が言語ごとに持つ。画面が言語を送らなければ日本語（言語を送らない前の画面と同じ）。
      // 知らない言語は、黙って別の言語に倒さずに断る
      const locale = params.locale ?? "ja";
      if (!LOCALES.includes(locale)) throw new BadRequest("unknown locale", { locale });
      return { locale };
    }
    case "lines":
    case "records":
      return { path: need("path"), from: need("from"), count: need("count") };
    case "line":
      return { path: need("path"), n: need("n") };
    case "record":
    case "record/body":
      return { path: need("path"), offset: need("offset"), length: need("length") };
    default:
      throw new BadRequest("unknown op", { op });
  }
};

/**
 * 署名をもらい、daemon に渡し、答えを返す。**署名はこの関数の外に出ない** ——
 * 応答にもログにも、失敗の文にも載せない（call が URL 入りの例外を投げても伏せる）。
 * 見えない archive なら、capture-ledger の応答（404）をそのまま返す。
 *
 * 順番に意味がある: 先に capture-ledger へ訊くので、**見てよい archive でなければ daemon まで
 * 行かない**。絞るのは認可を持っている側。
 */
export const viaSignedUrl = async ({ toLedger, call }, archiveId) => {
  const signed = await toLedger(`/api/archives/${encodeURIComponent(archiveId)}/url`, "POST");
  if (!signed.ok) return signed;
  const { url: href } = await signed.json();
  try {
    return await call(href);
  } catch (err) {
    // 句を持つ誤り（daemon に届かない）は、値の中の URL だけを伏せて、句と値のまま返す
    const hide = (value) => (typeof value === "string" ? value.replaceAll(href, "(signed URL)") : value);
    if (err instanceof Told) {
      throw new Told(err.message, Object.fromEntries(Object.entries(err.params).map(([k, v]) => [k, hide(v)])));
    }
    throw new Error(hide(err instanceof Error ? err.message : String(err)));
  }
};
