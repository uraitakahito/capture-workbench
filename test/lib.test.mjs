/**
 * 外と話さない部分の試験。
 *
 * **ここで見るのは「配ってよい path か」「知っている形式か」「門が通すか」だけ。** 中継も
 * 名乗りも http の口に在り、あれは動かさないと確かめられない（反証は手で当てる）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Readable } from "node:stream";

import {
  contentType,
  hostAllowed,
  isWriteRoute,
  optional,
  readBody,
  safePath,
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

test("Host は workbench の口だけを通す（127.0.0.1 と localhost）", () => {
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

test("書く口は、workbench のページからの JSON を通す", () => {
  assert.equal(writeRefusal(fromThisPage, 7080), undefined);
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": "application/json; charset=utf-8" }, 7080), undefined);
  assert.equal(
    writeRefusal({ host: "localhost:7080", origin: "http://localhost:7080", "content-type": "application/json" }, 7080),
    undefined,
  );
});

test("書く口は、ほかのオリジン・Origin の無い要求・JSON でない本文を断る", () => {
  assert.equal(writeRefusal({ ...fromThisPage, origin: "https://evil.test" }, 7080)?.status, 403);
  // curl や別の道具は Origin を付けない。書く口は workbench のページのためだけに在る
  assert.equal(writeRefusal({ host: fromThisPage.host, "content-type": "application/json" }, 7080)?.status, 403);
  // 同じ 127.0.0.1 でも、口が違えば別のオリジン
  assert.equal(writeRefusal({ ...fromThisPage, origin: "http://127.0.0.1:7081" }, 7080)?.status, 403);
  // form が preflight なしで送れる形。JSON らしい中身でも、content-type で断る
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": "text/plain" }, 7080)?.status, 415);
  assert.equal(writeRefusal({ ...fromThisPage, "content-type": undefined }, 7080)?.status, 415);
  assert.equal(writeRefusal({ ...fromThisPage, host: "evil.test:7080", origin: "http://evil.test:7080" }, 7080)?.status, 403);
});

test("書く口は、クロールを始める口と、その場の TS の直し方を訊く口と、宣言を訊く口の 3 つの形だけ", () => {
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

test("書く口は、% と . で台帳のほかの口へ回り込む形を断る", () => {
  const id = "5b0c0008-6a1e-4000-8000-000000000008";
  // fetch は URL の .. を畳む（%2e%2e も）。/api/crawls/../… は台帳の別の口に届いてしまう
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

test("書く口の本文は、上限ちょうどまで受け、1 バイト超えたら断る", async () => {
  // 読み切ってから断る —— 途中で切ると、413 を書く相手が居なくなる
  const body = (n) => Readable.from([Buffer.alloc(n, 0x61)]);
  assert.equal((await readBody(body(1024), 1024)).length, 1024);
  await assert.rejects(readBody(body(1025), 1024), TooLarge);
});

test("書く口の上限は、台帳の POST /api/crawls と同じ 1 MiB", () => {
  // 片方だけを変えると、workbench が通すのに台帳が 413 になる（capture-ledger の CRAWL_BODY_LIMIT）
  assert.equal(WRITE_LIMIT, 1024 * 1024);
});
