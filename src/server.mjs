#!/usr/bin/env node
/**
 * workbench の画面（`public/`）を配り、capture-ledger の API を中継する。
 *
 *   npm run dev         # http://127.0.0.1:7080/
 *
 * ## この repo は秘密を持たない
 *
 * 人は IdP（本番は Amazon Cognito、手元は capture-ledger の compose の Floci）のサインインの画面を
 * 通り、workbench は戻ってきた code を access token に替えてメモリのセッションに持つ（`auth.mjs`）。
 * app client は public（secret を持たない）で、code の横取りは PKCE が防ぐ。`.env` に書くのは
 * IdP の `iss` と app client の ID だけで、鍵もトークンも置き場が無い ——
 * **漏れる物が無いので、漏らさない工夫も要らない。**
 *
 * ## なぜ中継するのか
 *
 * capture-ledger は CORS を返さない（`OPTIONS /api/archives` は 404。実測）。ブラウザから
 * 直に叩く道は塞がっているので、同一オリジンにするために通す。**ここに workbench の
 * ロジックは置かない** —— 置いた瞬間に「capture-ledger が知っていることの写し」が生まれる。
 *
 * ## 書き込みのエンドポイント
 *
 * 書くのは `POST /api/crawls`（クロールを始める）と、`POST /api/crawls/:id/inline/:name/fix`（型で落ちた
 * その場の TS の直し方を訊く）だけで、中身は検査せずに capture-ledger へ渡す。起点の URL も方針も、直しが検査に通るかも、
 * 決めるのは capture-ledger。代わりに門を通す —— 全部のエンドポイントで Host を見て（DNS rebinding）、書き込みのエンドポイントでは workbench の
 * ページからの JSON だけを受ける（CSRF）。書き込みのエンドポイントの形と門の判定は `lib.mjs` に在り、試験から直接呼べる。
 *
 * ## 7080 であって 7000 ではない
 *
 * macOS の ControlCenter (AirPlay Receiver) が `*:7000` を握っている（実測）。
 * `127.0.0.1:7000` に bind すること自体はできてしまうが、**`localhost:7000` が
 * `::1` へ解決されると AirPlay に当たる** し、port から持ち主を引く道具
 * (capture-ledger の `dev:status` / `dev:down`) は毎回「別のものが握っている」と
 * 言い続けることになる。空いている隣 (capture-ledger が 7070) を取る。
 *
 * ## http・loopback・公開しない
 *
 * https のページから `127.0.0.1` を叩くと Chrome の Private Network Access が
 * 止める（実測。seaweedfs の filer は preflight に `Access-Control-Allow-Private-Network`
 * を返さなかった）。だから workbench 自身を loopback の http で配る。外に出さない。
 */
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { cookieValue, createAuth, SESSION_COOKIE, sessionCookie, whoOf } from "./auth.mjs";

import {
  contentType,
  forwardedHeaders,
  hostAllowed,
  isWriteRoute,
  optional,
  readBody,
  safePath,
  TooLarge,
  WRITE_LIMIT,
  writeRefusal,
} from "./lib.mjs";
import { BadRequest, paramsFor, parseWaczRoute, viaSignedUrl } from "./wacz.mjs";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

const PORT = Number(optional("WORKBENCH_PORT", "7080"));
const LEDGER = optional("WORKBENCH_LEDGER_URL", "http://127.0.0.1:7070");
/**
 * 人の名乗りの IdP。手元は capture-ledger の Floci で、プールの ID が `iss` に入る（作り直すたびに替わる）ので
 * 既定値を持たない —— capture-ledger の `dev:up` が `idp:bootstrap` の引き渡しから読んで渡す。
 */
const OIDC_ISSUER = optional("WORKBENCH_OIDC_ISSUER", "");
const OIDC_CLIENT_ID = optional("WORKBENCH_OIDC_CLIENT_ID", "");
/** IdP に登録した戻り先と一字一句同じでなければならない（capture-ledger の idp:bootstrap が登録する）。 */
const REDIRECT_URI = `http://127.0.0.1:${String(PORT)}/callback`;
/**
 * 深いリンクの行き先。**workbench はこれを組み立てない** —— capture-ledger が返すのは `objectKey`・クロールの合本の鍵
 * （`replayBundle.key`）・`lastJob.id` だけで、どこで開くかは配備の事実。1 か所で決めて `/healthz` で配る。
 */
const REPLAYWEB_SERVER = optional("WORKBENCH_REPLAYWEB_SERVER_URL", "http://127.0.0.1:8899");
/** 改変した Web Capture のビューア（capture-player）。リンクの形は replayweb-server と同じ（CAPTURE-102）。 */
const CAPTURE_PLAYER = optional("WORKBENCH_CAPTURE_PLAYER_URL", "http://127.0.0.1:8897");
const WINDMILL = optional("WORKBENCH_WINDMILL_URL", "http://127.0.0.1:8000");
const WORKSPACE = optional("WORKBENCH_WINDMILL_WORKSPACE", "crawler");
/** WACZ を検証する daemon。**鍵を持たない** —— capture-ledger が署名した URL だけを読む。 */
const VALIDATOR = optional("WORKBENCH_VALIDATOR_URL", "http://127.0.0.1:7180");
const auth = createAuth({ issuer: OIDC_ISSUER, clientId: OIDC_CLIENT_ID, redirectUri: REDIRECT_URI });

/** サインインしていない（セッションが無い・取り直せない）。画面はこれを見てサインインへ回る。 */
class NotSignedIn extends Error {}

/**
 * capture-ledger へ中継する。トークンはその人のセッションの物。
 *
 * **時計で測らず、401 で取得し直す。** 寿命を数える形にすると、IdP のプールを作り直した日に落ちる ——
 * 鍵が変わり、まだ有効なはずのトークンが静かに通らなくなる。401 は、その両方（期限切れ・鍵替わり）を
 * 同じ形で言う。取り直しは refresh token で、それも通らなければサインインからやり直してもらう。
 */
const toLedger = async (path, method = "GET", body = undefined, session = undefined, extra = {}) => {
  if (auth.tokenOf(session) === undefined) throw new NotSignedIn("サインインしていません");
  const send = async () => {
    try {
      // 401 で取得し直したときも、同じ body を送り直す（文字列なので何度でも読める）
      return await fetch(LEDGER + path, {
        method,
        headers: {
          ...extra,
          authorization: `Bearer ${auth.tokenOf(session)?.accessToken ?? ""}`,
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        ...(body !== undefined && { body }),
      });
    } catch (err) {
      // **何が居ないかを言う。** 素の `fetch failed` は、capture-ledger が落ちているのか
      // 宛先を間違えているのかを区別しない。
      throw new Error(
        `${LEDGER} に届かない (${err instanceof Error ? err.message : String(err)})。` +
          "capture-ledger で pnpm run api は動いているか?",
      );
    }
  };
  let res = await send();
  if (res.status === 401) {
    if (!(await auth.refresh(session))) throw new NotSignedIn("サインインが切れました");
    res = await send();
  }
  return res;
};

/**
 * daemon に POST する。**鍵ではなく URL を渡す**ので、向こうは何も持たない。
 * 届かなければ、何が居ないかを名指しする。
 */
const toDaemon = async (path, body) => {
  try {
    return await fetch(`${VALIDATOR}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `${VALIDATOR} に届かない (${err instanceof Error ? err.message : String(err)})。` +
        "capture-ledger で pnpm run dev:up --from validator は済んでいるか?",
    );
  }
};

/**
 * 上流の答えを流す。通すヘッダは allowlist —— daemon の `date` や `connection` を
 * workbench の応答に混ぜない。画像の実体（`/record/body`）は bytes のまま、印
 * （`nosniff` · `sandbox` · `no-store`）ごと通す。
 */
const PASS_HEADERS = ["content-type", "content-length", "x-content-type-options", "content-security-policy", "cache-control"];

const pass = async (reply, upstream) => {
  const headers = {};
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  headers["content-type"] ??= "application/json; charset=utf-8";
  reply.writeHead(upstream.status, headers);
  if (upstream.body === null) {
    reply.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body), reply);
};

/** capture-ledger の答えを、状態と content-type と本文のまま返す。 */
const relay = async (reply, res) => {
  reply.writeHead(res.status, {
    "content-type": res.headers.get("content-type") ?? "application/json; charset=utf-8",
  });
  reply.end(await res.text());
};

const sendJson = (reply, status, body) => {
  reply.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  reply.end(JSON.stringify(body));
};

/** 失敗は、**何が居ないか**を言う。「見えない」と「立っていない」を混ぜない。 */
const failed = (reply, err) => {
  // 流している途中で切れたら、もう頭は書けない。閉じるだけ。
  if (reply.headersSent) {
    reply.destroy();
    return;
  }
  if (err instanceof NotSignedIn) {
    // 画面 (`public/app.js` の `api`) は `login` を見てサインインへ回る。
    sendJson(reply, 401, { error: err.message, login: "/login" });
    return;
  }
  const status = err instanceof BadRequest ? 400 : err instanceof TooLarge ? 413 : 502;
  sendJson(reply, status, { error: err instanceof Error ? err.message : String(err) });
};

/** 302 で回す。 */
const redirect = (reply, location, headers = {}) => {
  reply.writeHead(302, { location, ...headers });
  reply.end();
};

const server = createServer((request, reply) => {
  const url = request.url ?? "/";
  const session = cookieValue(request.headers.cookie, SESSION_COOKIE);

  // **どのエンドポイントも、workbench の Host でなければ答えない**（DNS rebinding。`lib.mjs` の注）。
  // dev:up の準備の確かめは `http://127.0.0.1:<ポート>/healthz` を引くので、ここを通る。
  if (!hostAllowed(request.headers.host, PORT)) {
    sendJson(reply, 403, { error: "workbench の Host ではない" });
    return;
  }

  // 生存と、workbench が要る設定。**`/api/` の下には置かない** —— あちらは capture-ledger へ素通しする
  // 場所で、こちらの答えを混ぜると「どちらが答えたのか」が読めなくなる。
  if (url === "/healthz") {
    const held = auth.tokenOf(session);
    reply.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    reply.end(
      JSON.stringify({
        ok: true,
        // 誰としてサインインしているか (画面の上に出す)。サインインしていなければ null。
        signedIn: held === undefined ? null : whoOf(held.accessToken),
        replaywebServerOrigin: REPLAYWEB_SERVER,
        capturePlayerOrigin: CAPTURE_PLAYER,
        windmillOrigin: WINDMILL,
        windmillWorkspace: WORKSPACE,
        // 書き込みのエンドポイントの上限。workbench は欄の下に本文の大きさを出し、超えたら送る前に止める
        writeLimit: WRITE_LIMIT,
      }),
    );
    return;
  }

  /**
   * サインイン。IdP のサインインの画面へ回し、戻り先 (`/callback`) で code をトークンに替える。
   * **どれも GET。** IdP から戻る道は GET のリダイレクトなので、書き込みの門 (JSON だけ) は掛けない ——
   * 代わりに state と PKCE が、よそのページが作った戻りを断る。
   */
  const [pathname, query = ""] = url.split("?");
  if (pathname === "/login" && request.method === "GET") {
    if (!auth.configured) {
      reply.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      reply.end(
        "サインインの設定が無い —— WORKBENCH_OIDC_ISSUER と WORKBENCH_OIDC_CLIENT_ID を書く " +
          "(capture-ledger の pnpm run dev:up が渡す。値は capture-ledger の .dev/idp.env)\n",
      );
      return;
    }
    void auth
      .beginLogin()
      .then((location) => {
        redirect(reply, location);
      })
      .catch((err) => {
        failed(reply, err);
      });
    return;
  }
  if (pathname === "/callback" && request.method === "GET") {
    const params = new URLSearchParams(query);
    void auth
      .finishLogin(params.get("code") ?? undefined, params.get("state") ?? undefined)
      .then((done) => {
        if ("error" in done) {
          reply.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          reply.end(`サインインできませんでした: ${done.error}\n`);
          return;
        }
        redirect(reply, "/", { "set-cookie": sessionCookie(done.session) });
      })
      .catch((err) => {
        failed(reply, err);
      });
    return;
  }
  if (pathname === "/logout" && request.method === "GET") {
    auth.logout(session);
    redirect(reply, "/", { "set-cookie": sessionCookie("", 0) });
    return;
  }

  /**
   * WACZ の中身を読むエンドポイント（検証・行の窓・1 行・レコードの一覧・1 レコード・画像の実体）。
   *
   * **署名付き URL をここから外に出さない。** 応答にもログにも載せない ——
   * 載せると認可で閉じた意味が消える（期限内なら、URL を持つ者は誰でも読める）。
   * 署名は範囲ごとに取り直す（1 本 7 ms・実測）。取っておくと、workbench が
   * 300 秒有効な鍵を持つことになる。
   *
   * 順番に意味がある: 先に capture-ledger へ訊くので、**見てよい archive でなければ
   * daemon まで行かない**。絞るのは認可を持っている側。
   */
  const route = parseWaczRoute(url);
  if (route !== undefined) {
    const expected = route.op === "validate" ? "POST" : "GET";
    if (request.method !== expected) {
      reply.writeHead(405, { allow: expected, "content-type": "text/plain; charset=utf-8" });
      reply.end(`${expected} だけ\n`);
      return;
    }
    void (async () => {
      const params = paramsFor(route.op, route.params); // 壊れた引数は署名をもらう前に 400
      const upstream = await viaSignedUrl(
        {
          toLedger: (path, method, body) => toLedger(path, method, body, session),
          call: (href) => toDaemon(`/${route.op}`, { source: { kind: "uri", uri: href }, ...params }),
        },
        route.archiveId,
      );
      await pass(reply, upstream);
    })().catch((err) => {
      failed(reply, err);
    });
    return;
  }

  /**
   * 書き込みのエンドポイント（`lib.mjs` の `isWriteRoute`）。**中身は検査しない** —— クロールを始める頼みも、直し方を訊く頼みも、宣言を訊く頼みも
   * capture-ledger が検査して決め、答えをそのまま返す。門だけはここで見る。
   */
  if (isWriteRoute(url) && request.method === "POST") {
    const refusal = writeRefusal(request.headers, PORT);
    if (refusal !== undefined) {
      sendJson(reply, refusal.status, { error: refusal.error });
      return;
    }
    void readBody(request, WRITE_LIMIT)
      .then((body) => toLedger(url, "POST", body, session, forwardedHeaders(url, request.headers)))
      .then((res) => relay(reply, res))
      .catch((err) => {
        failed(reply, err);
      });
    return;
  }

  if (url.startsWith("/api/")) {
    // 読み取りのエンドポイントは GET だけ。ほかの method を GET として通すと、書けたように見えてしまう。
    if (request.method !== "GET") {
      reply.writeHead(405, { allow: "GET", "content-type": "text/plain; charset=utf-8" });
      reply.end("GET だけ（書き込みのエンドポイントは POST /api/crawls・POST /api/crawls/:id/inline/:name/fix・POST /api/crawls/:id/failed・POST /api/scripts/check・POST /api/schedules・POST /api/schedules/:id/<操作>）\n");
      return;
    }
    void toLedger(url, "GET", undefined, session)
      .then((res) => relay(reply, res))
      .catch((err) => {
        failed(reply, err);
      });
    return;
  }

  // 画面そのものも、サインインしてから配る。IdP の設定が無ければ配る (API の 401 が理由を言う)。
  if (
    (pathname === "/" || pathname === "/index.html") &&
    auth.configured &&
    auth.tokenOf(session) === undefined
  ) {
    redirect(reply, "/login");
    return;
  }

  const path = safePath(PUBLIC, url);
  const type = path === undefined ? undefined : contentType(path);
  if (path === undefined || type === undefined) {
    reply.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    reply.end("not found\n");
    return;
  }
  void readFile(path)
    .then((body) => {
      reply.writeHead(200, { "content-type": type });
      reply.end(body);
    })
    .catch(() => {
      reply.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      reply.end("not found\n");
    });
});

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
};

/**
 * 港が塞がっていたら、**誰が握っているかを言ってから**終わる。
 *
 * 素の `EADDRINUSE` は node の stack trace で出るだけで、`dev:up` が起こした
 * workbench 自身が握っているのか、無関係なものなのかを言わない —— 実際に
 * 2026-09-21 にそれで止まった（`container-compose down` はホストのプロセスを
 * 消さないので、スタックを落とした後も workbench だけが残る）。
 *
 * **自分と同じものが握っているなら、それは失敗ではない。** 開けばよい。
 */
const portTaken = () => {
  const pid = run("lsof", ["-nP", `-iTCP:${String(PORT)}`, "-sTCP:LISTEN", "-t"]).split("\n")[0];
  const command = pid === "" ? "" : run("ps", ["-p", pid, "-o", "command="]);
  const cwd =
    pid === ""
      ? ""
      : (run("lsof", ["-a", "-d", "cwd", "-p", pid, "-Fn"])
          .split("\n")
          .find((line) => line.startsWith("n")) ?? "").slice(1);
  const mine = command.includes("src/server.mjs") && cwd !== "" && resolve(cwd) === resolve(ROOT);

  process.stderr.write(
    mine
      ? `127.0.0.1:${String(PORT)} は、既に動いている workbench です (pid ${pid})。\n` +
          `  開くだけ: open http://127.0.0.1:${String(PORT)}/\n` +
          "  起こし直すなら: cd ../capture-ledger && pnpm run dev:up --from workbench\n"
      : `127.0.0.1:${String(PORT)} は別のものが握っています${pid === "" ? "" : ` (pid ${pid})`}。\n` +
          (command === "" ? "" : `  ${command}\n`) +
          "  何が立っているか: cd ../capture-ledger && pnpm run dev:status\n" +
          "  片付け:           cd ../capture-ledger && pnpm run dev:down\n",
  );
  process.exit(1);
};

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") portTaken();
  throw err;
});

// **loopback にだけ bind する。** workbench は capture-ledger のトークンを持つので、
// 届く相手はこの機械の中だけでよい。
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `workbench http://127.0.0.1:${String(PORT)}/  capture-ledger: ${LEDGER}  ` +
      (auth.configured
        ? `名乗り: ${OIDC_ISSUER} のサインイン (client ${OIDC_CLIENT_ID})\n`
        : "名乗りの設定が無い —— WORKBENCH_OIDC_ISSUER と WORKBENCH_OIDC_CLIENT_ID を書く\n"),
  );
});
