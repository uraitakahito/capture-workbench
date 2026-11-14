/**
 * 外と話さない部分の試験。
 *
 * **ここで見るのは「配ってよい path か」「知っている形式か」「門が通すか」と、上流の答えの流し方だけ。** 流し方
 * （`pass`・`relay`・`relayFor`）は、偽の応答（`Response`）と偽の返し先を渡して見る。capture-ledger へ繋ぐ所と振り分けは
 * http の側（`server.mjs`）に在り、あれは動かさないと確かめられない（反証は手で当てる）。名乗り（`src/auth.mjs`）は、
 * `auth.test.mjs` が偽の IdP を渡して見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";

import {
  contentType,
  ERROR_PHRASES,
  errorBody,
  forwardedHeaders,
  hostAllowed,
  isScreenshotRoute,
  isWriteRoute,
  optional,
  pass,
  PASS_HEADERS,
  readBody,
  relay,
  relayFor,
  safePath,
  Told,
  TooLarge,
  WRITE_LIMIT,
  writeRefusal,
} from "../src/lib.mjs";

const ROOT = resolve("/tmp/public");

test("空文字は「無い」と同じ —— 既定値に落ちる", () => {
  process.env.WORKBENCH_TEST_PROBE = "";
  assert.equal(optional("WORKBENCH_TEST_PROBE", "既定"), "既定");
  process.env.WORKBENCH_TEST_PROBE = "値";
  assert.equal(optional("WORKBENCH_TEST_PROBE", "既定"), "値");
  delete process.env.WORKBENCH_TEST_PROBE;
  assert.equal(optional("WORKBENCH_TEST_PROBE", "既定"), "既定");
});

test("ディレクトリの要求は index.html になる", () => {
  assert.equal(safePath(ROOT, "/"), resolve(ROOT, "index.html"));
});

test("根の外へ出ようとする path は、根の中へ畳まれる", () => {
  // **undefined にはならない。** `normalize` が `..` を根で食べるので、
  // 出来上がるのは根の中の（たいてい存在しない）path になり、読めずに 404 になる。
  // 「外に出られない」ことだけが約束で、「拒む」ことは約束していない。
  assert.equal(safePath(ROOT, "/../etc/passwd"), resolve(ROOT, "etc/passwd"));
  assert.equal(safePath(ROOT, "/a/../../etc/passwd"), resolve(ROOT, "etc/passwd"));
});

test("符号化された `..` も同じに畳まれる —— 文字列で探す形では破れる", () => {
  // `%2e%2e` は decodeURIComponent の後に `..` になる。**復号してから**正規化するので、
  // 符号化の違いはここで消える。生の文字列で `..` を探す形は、1 つ見落とすと破れる。
  assert.equal(safePath(ROOT, "/%2e%2e/%2e%2e/etc/passwd"), resolve(ROOT, "etc/passwd"));
});

test("壊れた符号化は開かない", () => {
  assert.equal(safePath(ROOT, "/%"), undefined);
});

test("query は path に混ぜない", () => {
  assert.equal(safePath(ROOT, "/app.js?v=2"), resolve(ROOT, "app.js"));
});

test("知らない拡張子は配らない —— 拡張子が無いものも", () => {
  assert.equal(contentType("/x/app.js"), "text/javascript; charset=utf-8");
  assert.equal(contentType("/x/.env"), undefined);
  assert.equal(contentType("/x/Makefile"), undefined);
});

test("Host は workbench の host:port だけを通す（127.0.0.1 と localhost）", () => {
  assert.equal(hostAllowed("127.0.0.1:7080", 7080), true);
  assert.equal(hostAllowed("localhost:7080", 7080), true);
  // DNS rebinding: よその名前が 127.0.0.1 を指していても、Host には名前のほうが載る
  assert.equal(hostAllowed("evil.test:7080", 7080), false);
  assert.equal(hostAllowed("127.0.0.1:7081", 7080), false);
  assert.equal(hostAllowed("127.0.0.1", 7080), false);
  assert.equal(hostAllowed(undefined, 7080), false);
});

/** workbench のページが fetch で送る要求の頭（同じオリジン・JSON）。 */
const fromThisPage = {
  host: "127.0.0.1:7080",
  origin: "http://127.0.0.1:7080",
  "content-type": "application/json",
};

test("書き込みのエンドポイントは、workbench のページからの JSON を通す", () => {
  assert.equal(writeRefusal(fromThisPage, 7080), undefined);
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": "application/json; charset=utf-8" }, 7080), undefined);
  assert.equal(
    writeRefusal({ host: "localhost:7080", origin: "http://localhost:7080", "content-type": "application/json" }, 7080),
    undefined,
  );
});

test("書き込みのエンドポイントは、ほかのオリジン・Origin の無い要求・JSON でない本文を断る", () => {
  assert.equal(writeRefusal({ ...fromThisPage, origin: "https://evil.test" }, 7080)?.status, 403);
  // curl や別の道具は Origin を付けない。書き込みのエンドポイントは workbench のページのためだけに在る
  assert.equal(writeRefusal({ host: fromThisPage.host, "content-type": "application/json" }, 7080)?.status, 403);
  // 同じ 127.0.0.1 でも、ポートが違えば別のオリジン
  assert.equal(writeRefusal({ ...fromThisPage, origin: "http://127.0.0.1:7081" }, 7080)?.status, 403);
  // form が preflight なしで送れる形。JSON らしい中身でも、content-type で断る
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": "text/plain" }, 7080)?.status, 415);
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": undefined }, 7080)?.status, 415);
  assert.equal(writeRefusal({ ...fromThisPage, host: "evil.test:7080", origin: "http://evil.test:7080" }, 7080)?.status, 403);
});

test("書き込みのエンドポイントは、定期実行の予定を作る・操作する・行を締める POST も通す", () => {
  const id = "5b0c0008-6a1e-4000-8000-000000000008";
  assert.equal(isWriteRoute("/api/schedules"), true);
  for (const action of ["pause", "resume", "run", "repin", "delete"]) {
    assert.equal(isWriteRoute(`/api/schedules/${id}/${action}`), true, action);
  }
  assert.equal(isWriteRoute(`/api/crawls/${id}/failed`), true);
  // 知らない操作・末尾の足し・query・ほかの段
  assert.equal(isWriteRoute(`/api/schedules/${id}`), false);
  assert.equal(isWriteRoute(`/api/schedules/${id}/nope`), false);
  assert.equal(isWriteRoute(`/api/schedules/${id}/run/`), false);
  assert.equal(isWriteRoute(`/api/schedules/${id}/run?x=1`), false);
  assert.equal(isWriteRoute("/api/schedules/"), false);
  assert.equal(isWriteRoute("/api/schedules?x=1"), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/failed/`), false);
  // fetch が .. を畳むので、capture-ledger のほかのエンドポイントへ回り込む形を断る
  assert.equal(isWriteRoute(`/api/schedules/${id}/../../crawls`), false);
  assert.equal(isWriteRoute("/api/schedules/../crawls"), false);
  assert.equal(isWriteRoute(`/api/schedules/${id}%2F/run`), false);
  assert.equal(isWriteRoute("/api/crawls/../failed"), false);
});

test("書き込みのエンドポイントは、クロールを始める・その場の TS の直し方を訊く・宣言を訊く POST を通し、末尾の足し・query・ほかの段を断る", () => {
  const id = "5b0c0008-6a1e-4000-8000-000000000008";
  assert.equal(isWriteRoute("/api/crawls"), true);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/close-banner/fix`), true);
  assert.equal(isWriteRoute("/api/scripts/check"), true);
  // 末尾の足し・query・ほかの段
  assert.equal(isWriteRoute("/api/crawls/"), false);
  assert.equal(isWriteRoute("/api/crawls?x=1"), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/close-banner/fix/`), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/close-banner/fix?x=1`), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/close-banner`), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/pages`), false);
  assert.equal(isWriteRoute(`/api/archives/${id}/url`), false);
  assert.equal(isWriteRoute("/api/scripts/check/"), false);
  assert.equal(isWriteRoute("/api/scripts/check?x=1"), false);
  assert.equal(isWriteRoute("/api/scripts/check/x"), false);
  assert.equal(isWriteRoute("/api/scripts"), false);
  assert.equal(isWriteRoute("/api/scripts/checks"), false);
  assert.equal(isWriteRoute("/xapi/scripts/check"), false);
});

test("書き込みのエンドポイントは、% と . で capture-ledger のほかのエンドポイントへ回り込む形を断る", () => {
  const id = "5b0c0008-6a1e-4000-8000-000000000008";
  // fetch は URL の .. を畳む（%2e%2e も）。/api/crawls/../… は capture-ledger の別のエンドポイントに届いてしまう
  assert.equal(isWriteRoute("/api/crawls/../inline/x/fix"), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/../fix`), false);
  assert.equal(isWriteRoute("/api/crawls/%2e%2e/inline/x/fix"), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}%2Fx/inline/close-banner/fix`), false);
  assert.equal(isWriteRoute(`/api/crawls/${id}/inline/close%2Dbanner/fix`), false);
  assert.equal(isWriteRoute("/api/scripts/../crawls"), false);
  assert.equal(isWriteRoute("/api/scripts/check/../../crawls"), false);
  assert.equal(isWriteRoute("/api/scripts/%63heck"), false);
  assert.equal(isWriteRoute("/api/scripts/check%2F"), false);
});

test("書き込みのエンドポイントの本文は、上限ちょうどまで受け、1 バイト超えたら断る", async () => {
  // 読み切ってから断る —— 途中で切ると、413 を書く相手が居なくなる
  const body = (n) => Readable.from([Buffer.alloc(n, 0x61)]);
  assert.equal((await readBody(body(1024), 1024)).length, 1024);
  await assert.rejects(readBody(body(1025), 1024), (err) => {
    assert.ok(err instanceof TooLarge);
    // 文ではなく、句と値（上限のバイト数）を返す。文にするのは画面の辞書
    assert.deepEqual(errorBody(err), { error: "body too large", params: { limit: 1024 } });
    return true;
  });
});

test("誤りの答えは句と値。知らない句は作れず、句を持たない誤りは文のまま返す", () => {
  assert.deepEqual(errorBody(new Told("ledger unreachable", { url: "http://127.0.0.1:7070", cause: "fetch failed" })), {
    error: "ledger unreachable",
    params: { url: "http://127.0.0.1:7070", cause: "fetch failed" },
  });
  assert.deepEqual(errorBody(new Told("json only")), { error: "json only", params: {} });
  assert.throws(() => new Told("no such phrase"), /unknown error phrase/);
  assert.deepEqual(errorBody(new Error("fetch failed")), { error: "fetch failed" });
  assert.deepEqual(errorBody("plain"), { error: "plain" });
});

test("書き込みの門の断りは、句の一覧に在る句で言う", () => {
  const refusals = [
    writeRefusal({ ...fromThisPage, host: "evil.test:7080", origin: "http://evil.test:7080" }, 7080),
    writeRefusal({ ...fromThisPage, origin: "https://evil.test" }, 7080),
    writeRefusal({ ...fromThisPage, "content-type": "text/plain" }, 7080),
  ];
  assert.deepEqual(refusals.map((r) => r?.error), ["not the workbench host", "not from a workbench page", "json only"]);
  for (const refusal of refusals) assert.ok(ERROR_PHRASES.includes(refusal?.error), refusal?.error);
});

test("書き込みのエンドポイントの上限は、capture-ledger の POST /api/crawls と同じ 1 MiB", () => {
  // 片方だけを変えると、workbench が通すのに capture-ledger が 413 になる（capture-ledger の CRAWL_BODY_LIMIT）
  assert.equal(WRITE_LIMIT, 1024 * 1024);
});

test("中継で運ぶ見出しは、POST /api/crawls の Idempotency-Key だけ", () => {
  const headers = { "idempotency-key": "k1", cookie: "s=1", authorization: "Bearer x" };
  assert.deepEqual(forwardedHeaders("/api/crawls", headers), { "idempotency-key": "k1" });
  // ほかの書き込みには運ばない・鍵が無ければ何も足さない
  assert.deepEqual(forwardedHeaders("/api/schedules", headers), {});
  assert.deepEqual(forwardedHeaders("/api/crawls", { cookie: "s=1" }), {});
});

// ── 節目のスクリーンショットの中継（CAPTURE-432）────────────────────────────
const ARCHIVE = "5e6d1ed0-c5b0-35a7-b71b-517fa8aa6b97";

test("絵のエンドポイントの形は、capture-ledger の 2 つの時点と 36 字の id だけ", () => {
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-load`), true);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-behaviors`), true);
  // 知らない時点・時点の無い形・35 字と 37 字の id
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/during-load`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE.slice(1)}/screenshots/after-load`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}0/screenshots/after-load`), false);
});

test("絵のエンドポイントは、末尾の足し・query・% と . で capture-ledger のほかのエンドポイントへ回り込む形を通さない", () => {
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-load/`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-load?x=1`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-load/x`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/after-load%2F`), false);
  // fetch は .. を畳む。id の 36 字を .. と / で埋めた形は、ほかの archive やほかのエンドポイントに届く
  assert.equal(isScreenshotRoute("/api/archives/../../../../../../../../../crawls/screenshots/after-load"), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE.slice(0, 33)}/../screenshots/after-load`), false);
  assert.equal(isScreenshotRoute(`/api/archives/%2e%2e${ARCHIVE.slice(6)}/screenshots/after-load`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE}/screenshots/%61fter-load`), false);
  assert.equal(isScreenshotRoute(`/xapi/archives/${ARCHIVE}/screenshots/after-load`), false);
  assert.equal(isScreenshotRoute(`/api/archives/${ARCHIVE.toUpperCase()}/screenshots/after-load`), false);
});

test("中継の返し方は、絵のエンドポイントだけがバイト列（pass）、ほかは字（relay）", () => {
  assert.equal(relayFor(`/api/archives/${ARCHIVE}/screenshots/after-load`), pass);
  assert.equal(relayFor(`/api/archives/${ARCHIVE}/screenshots/after-behaviors`), pass);
  for (const url of ["/api/archives", `/api/archives/${ARCHIVE}/url`, "/api/crawls", `/api/archives/${ARCHIVE}/screenshots/after-load?x=1`]) {
    assert.equal(relayFor(url), relay, url);
  }
});

/** node の http の応答の代わり。writeHead の状態と見出しと、書かれたバイト列を覚える。 */
const replyCatcher = () => {
  const chunks = [];
  const reply = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  reply.writeHead = (status, headers) => {
    reply.head = { status, headers };
    return reply;
  };
  reply.bytes = () => Buffer.concat(chunks);
  return reply;
};

/** WebP の頭と、UTF-8 として読めないバイト（0xff・0xfe・孤立した 0x80・途中で切れた 3 バイト列）を含む見本。 */
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x0c, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8L"),
  Buffer.from([0xff, 0xfe, 0x80, 0x00, 0xe3, 0x81, 0xc0, 0xaf]),
]);

const finished = (reply) => new Promise((done) => reply.on("finish", done));

test("pass は絵のバイト列を 1 バイトも変えずに通し、見出しは allowlist の物だけ", async () => {
  const upstream = new Response(WEBP, {
    status: 200,
    headers: {
      "content-type": "image/webp",
      "content-length": String(WEBP.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, max-age=300, immutable",
      "set-cookie": "s=1",
      date: "Sun, 15 Nov 2026 00:00:00 GMT",
      "x-powered-by": "fastify",
    },
  });
  const reply = replyCatcher();
  const done = finished(reply);
  await pass(reply, upstream);
  await done;
  assert.ok(reply.bytes().equals(WEBP), "バイト列のまま");
  assert.equal(reply.head.status, 200);
  assert.deepEqual(reply.head.headers, {
    "content-type": "image/webp",
    "content-length": String(WEBP.length),
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "private, max-age=300, immutable",
  });
  assert.deepEqual(Object.keys(reply.head.headers).sort(), [...PASS_HEADERS].sort());
  // 字として読むと壊れる見本であること（relay では通せない）
  assert.equal(Buffer.from(WEBP.toString("utf8"), "utf8").equals(WEBP), false);
});

test("pass は capture-ledger の 404 も状態と本文のまま通し、content-type が無ければ JSON と言う", async () => {
  const reply = replyCatcher();
  const done = finished(reply);
  // 字の本文だと Response が text/plain を足すので、バイト列で渡す（content-type の無い答え）
  await pass(reply, new Response(Buffer.from('{"error":"not found"}'), { status: 404, headers: { "x-other": "1" } }));
  await done;
  assert.equal(reply.head.status, 404);
  assert.equal(reply.head.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(reply.bytes().toString("utf8"), '{"error":"not found"}');
});

test("relay は状態と content-type と本文の字を返す（ほかの見出しは落とす）", async () => {
  const reply = replyCatcher();
  const done = finished(reply);
  await relay(reply, new Response('{"archives":[]}', { status: 200, headers: { "content-type": "application/json; charset=utf-8", "set-cookie": "s=1" } }));
  await done;
  assert.deepEqual(reply.head, { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  assert.equal(reply.bytes().toString("utf8"), '{"archives":[]}');
});
