/**
 * サーバが使う、外と話さない部分。**ここだけは試験から直接呼べる。**
 *
 * http の側（`server.mjs`）に混ぜないのは、混ぜた部分が「動かしてみないと
 * 分からない」側に入ってしまうため。path の組み立てと content-type と門の判定は、
 * 動かさずに確かめられる。
 */
import { normalize, resolve, sep } from "node:path";

/**
 * 画面の JS（`public/`）が受け取る誤りの句。**server は文を書かず、句と値を返す**（`{ error: 句, params: { … } }`）。
 * 文にするのは画面の辞書（`public/i18n/*.json` の `workbench.error.<句>`）で、言語は画面が決める。
 *
 * 句は英語の短い語の並びで、鍵として使う（言い換えると辞書の鍵が外れる）。`check:i18n` が、この一覧と辞書を
 * 両方向で照らす —— 句を足したら、2 つの辞書に文を足す。値の名前は、句ごとに右の注記のとおり。
 *
 * 画面の JS を通らずにブラウザへ直に出る文（`/login`・`/callback` の失敗と、text/plain の答え）は、ここに無い ——
 * 言語を選ぶ画面が無いので、英語と日本語を並べて書く。
 */
export const ERROR_PHRASES = Object.freeze([
  "not the workbench host",
  "not from a workbench page",
  "json only",
  "not signed in",
  "sign-in expired",
  "ledger unreachable", // url・cause
  "validator unreachable", // url・cause
  "parameter required", // name
  "unknown op", // op
  "unknown locale", // locale
  "body too large", // limit
]);

/**
 * 句と値を持つ誤り。`message` は句（英語）で、`params` は辞書の文に埋める値。知らない句は投げる ——
 * 辞書に文の無い句を、黙って返さない。
 */
export class Told extends Error {
  constructor(phrase, params = {}, options = undefined) {
    if (!ERROR_PHRASES.includes(phrase)) throw new Error(`unknown error phrase: ${phrase}`);
    super(phrase, options);
    this.name = "Told";
    this.params = params;
  }
}

/** 誤りを、答えの本文（JSON）にする。句を持つ誤りは値も載せる。ほかの誤りは、文をそのまま。 */
export const errorBody = (err) =>
  err instanceof Told
    ? { error: err.message, params: err.params }
    : { error: err instanceof Error ? err.message : String(err) };

/**
 * 環境変数を読む関数。**空文字は「無い」と同じに扱う**（POSIX の `${VAR:-word}` 側）。
 *
 * Web Capture の他の repo と同じ意味に揃えてある —— `??` は未設定のときしか既定値に
 * しないので、`NAME=` と書いた人が、名前の出ないエラーを遠くで踏む。
 */
export const optional = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

/** 配る content-type。**知らない拡張子は配らない**（undefined を返す）。 */
const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"],
]);

export const contentType = (path) => {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? undefined : TYPES.get(path.slice(dot));
};

/**
 * URL から、配ってよい絶対 path を作る。
 *
 * **外へ出る要求は、拒むのではなく根の中へ畳まれる。** `normalize` が `..` を根で
 * 食べるので、`/../etc/passwd` は `<root>/etc/passwd` になり、読めずに 404 で終わる。
 * 復号してから正規化するので、`%2e%2e` のような符号化の違いもここで消える ——
 * 生の文字列で `..` を探す形は、1 つ見落とした時点で破れる。
 *
 * 最後の `startsWith` は二重の守り。**いまの組み立てでは到達しない**（`.` を前に
 * 付けて根から解くので、必ず根の中に入る）。残してあるのは、この組み立てが
 * 「簡単にできる」と言って書き換えられる類のものだから。
 */
export const safePath = (root, url) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return undefined; // 壊れた符号化。開かない。
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const full = resolve(root, `.${normalize(pathname)}`);
  return full === root || full.startsWith(root + sep) ? full : undefined;
};

/**
 * Host が、workbench の host:port か。**全部のエンドポイントで見る** —— DNS rebinding（よそのドメインの名前を
 * 127.0.0.1 に向け直す手）で、別のサイトのページが workbench を自分のオリジンとして読むのを
 * 止める。書き込みのエンドポイントだけを守っても、読み取りのエンドポイントから一覧が漏れる。
 */
export const hostAllowed = (host, port) =>
  host === `127.0.0.1:${String(port)}` || host === `localhost:${String(port)}`;

/**
 * 書き込みのエンドポイント。**capture-ledger へそのまま渡す POST は、この形だけ**:
 *
 * - `/api/crawls` —— クロールを始める
 * - `/api/crawls/<id>/inline/<name>/fix` —— 型で落ちたクロールの、その場の TS の直し方を Claude に訊く
 *   （CAPTURE-49。capture-ledger は型の検査に通った案だけを返し、費用を数える）
 * - `/api/scripts/check` —— 書いている途中のその場の TS が宣言した変数を訊く。**書かない**が、source を本文で送るので
 *   POST で、JSON だけを通す門も要る（よそのページから叩かれると、ts-compile-service を働かせられる）
 * - `/api/schedules` —— 定期実行の予定を作る
 * - `/api/schedules/<id>/<操作>` —— 予定を操作する（`pause`・`resume`・`run`・`repin`・`delete`）
 * - `/api/crawls/<id>/failed` —— 走ったままのクロールを締める
 *
 * **端を固めて照らす** —— 末尾の足し・query・`%`（`%2F` も `%2e%2e` も）・`.` を通さない。id と名前の字まで絞るのは、
 * fetch が URL の `..` を畳み、capture-ledger のほかのエンドポイントに届かせないため。判断は capture-ledger がする —— ここは中継する形を絞るだけ。
 */
const WRITE_ROUTES = [
  /^\/api\/crawls$/,
  /^\/api\/crawls\/[0-9a-f-]+\/inline\/[a-z0-9-]+\/fix$/,
  /^\/api\/scripts\/check$/,
  /^\/api\/schedules$/,
  /^\/api\/schedules\/[0-9a-f-]+\/(?:pause|resume|run|repin|delete)$/,
  /^\/api\/crawls\/[0-9a-f-]+\/failed$/,
];

export const isWriteRoute = (url) => WRITE_ROUTES.some((route) => route.test(url));

/**
 * 書き込みの中継で capture-ledger へ運ぶ、要求の見出し。**運ぶのは `POST /api/crawls` の `Idempotency-Key` だけ**
 * （CAPTURE-180）。capture-ledger は鍵ごとに最初の答えを覚え、同じ鍵の送り直しには同じクロールを返す ——
 * 応答が切れた後に押し直しても、2 本目が始まらない。ほかの見出しは運ばない（中継は形を絞るだけ）。
 * 鍵の字は検査しない（capture-ledger が 400 で言う）。
 */
export const forwardedHeaders = (url, headers) => {
  const key = headers["idempotency-key"];
  return url === "/api/crawls" && typeof key === "string" ? { "idempotency-key": key } : {};
};

/**
 * 書き込みのエンドポイントの門。workbench のページからの JSON だけを通す。断るなら `{ status, error }` を返す
 * （`error` は句。`ERROR_PHRASES`）。
 *
 * Origin を見るのは CSRF（別のサイトのページに、利用者のブラウザから POST させる手）のため。
 * JSON に限るのは、form が preflight なしで送れる形（text/plain など）を締め出すため。
 * Chrome の Private Network Access には頼らない —— 版で振る舞いが変わる。
 */
export const writeRefusal = (headers, port) => {
  if (!hostAllowed(headers.host, port)) return { status: 403, error: "not the workbench host" };
  if (headers.origin !== `http://${String(headers.host)}`) {
    return { status: 403, error: "not from a workbench page" };
  }
  const type = (headers["content-type"] ?? "").split(";")[0].trim();
  if (type !== "application/json") return { status: 415, error: "json only" };
  return undefined;
};

/**
 * 書き込みのエンドポイントが受ける本文の上限。起点の URL と、その場で書いた TS が入る。**capture-ledger の
 * `POST /api/crawls` の上限（`src/api/crawls.ts` の `CRAWL_BODY_LIMIT`）と同じ 1 MiB** —— 片方だけを
 * 変えると、workbench が通すのに capture-ledger が 413、の形になる。workbench は `/healthz` の `writeLimit` で知り、
 * 送る前に止める。超えたら 413（capture-ledger まで行かない）。
 */
export const WRITE_LIMIT = 1024 * 1024;

export class TooLarge extends Told {}

/**
 * 本文を読む。上限を超えたら**溜めるのをやめ**、読み切ってから TooLarge で断る ——
 * 途中で接続を切ると、413 を書く相手が居なくなる。
 */
export const readBody = (request, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > limit) reject(new TooLarge("body too large", { limit }));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
