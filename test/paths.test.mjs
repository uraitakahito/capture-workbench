/**
 * 画面の URL の決まり（`public/paths.js`）。画面の path か・戻り先に使ってよいか・古い hash の URL の橋。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isScreenPath, loginHref, MAX_PATH, pathFromHash, SCREENS } from "../public/paths.js";

const CRAWL = "5b0c0003-6a1e-4000-8000-000000000003";

test("画面の path を受ける（query も）", () => {
  for (const path of [
    "/crawls",
    `/crawls/${CRAWL}`,
    `/crawls/${CRAWL}?from=ai`,
    "/crawls?from=ai&lang=en",
    `/trace/${CRAWL}/1301`,
    "/history/https%3A%2F%2Fsandbox.test%2Fpricing",
    "/search?q=%E6%97%A5%E6%9C%AC",
    "/archive/a1/archive%2Fdata.warc.gz:12",
    "/scripts/types/host.d.ts:3",
    "/scripts/autoscroll@4~0a1b2c:10",
  ]) {
    assert.equal(isScreenPath(path), true, path);
  }
});

test("よそ・API・壊れた字は画面の path でない（戻り先にしない）", () => {
  for (const path of [
    undefined,
    "",
    "/",
    "crawls",
    "//evil.test/crawls",
    "/\\evil.test",
    "https://evil.test/crawls",
    "javascript:alert(1)",
    "/crawls\r\nset-cookie: x=1",
    "/crawls%0D%0A",
    "/search?q=日本",
    "/crawls#x",
    "/crawls/../logout",
    "/crawls/%2e%2e/logout",
    "/crawls/./x",
    "/wacz/a1/record/body?offset=1&length=2",
    "/wacz/a1",
    "/logout",
    "/login?back=/crawls",
    "/api/crawls",
    "/healthz",
    "/app.js",
    "/crawlsx",
    `/crawls/${"a".repeat(MAX_PATH)}`,
  ]) {
    assert.equal(isScreenPath(path), false, String(path));
  }
});

test("頭の語は API の語と public/ の名を持たない（持つと、その path が画面に取られる）", () => {
  for (const api of ["api", "wacz", "login", "callback", "logout", "healthz"]) {
    assert.equal(SCREENS.includes(api), false, api);
  }
  const names = readdirSync(fileURLToPath(new URL("../public", import.meta.url)));
  for (const name of names) assert.equal(SCREENS.includes(name), false, name);
});

test("古い hash の URL を path に替える（橋）", () => {
  const table = [
    ["#crawls", "/crawls"],
    ["#start", "/start"],
    ["#schedules", "/schedules"],
    ["#archives", "/archives"],
    ["#changes", "/changes"],
    [`#changes/${CRAWL}`, `/changes/${CRAWL}`],
    [`#links/${CRAWL}/304`, `/links/${CRAWL}/304`],
    [`#trace/${CRAWL}/1301`, `/trace/${CRAWL}/1301`],
    ["#history/https%3A%2F%2Fsandbox.test%2Fpricing", "/history/https%3A%2F%2Fsandbox.test%2Fpricing"],
    ["#check/a1/browserhive", "/check/a1/browserhive"],
    ["#wacz/a1/archive%2Fdata.warc.gz:12", "/archive/a1/archive%2Fdata.warc.gz:12"],
    ["#wacz/a1", "/archive/a1"],
    ["#search", "/search"],
    ["#search/%E6%97%A5%E6%9C%AC", "/search?q=%E6%97%A5%E6%9C%AC"],
    ["#search/..", "/search?q=.."],
    ["#search/a%20b", "/search?q=a%20b"],
    ["#search/%E6%97%A5%", "/search"],
    ["#scripts", "/scripts"],
    ["#scripts/types/host.d.ts:3", "/scripts/types/host.d.ts:3"],
    ["#scripts/autoscroll@4~0a1b2c:10", "/scripts/autoscroll@4~0a1b2c:10"],
    // ブラウザが符号にしなかった字も、ASCII の外だけ符号にして渡す
    ["#scripts/日本", "/scripts/%E6%97%A5%E6%9C%AC"],
  ];
  for (const [hash, path] of table) assert.equal(pathFromHash(hash), path, hash);
});

test("画面の hash でなければ橋を渡らない", () => {
  for (const hash of ["", "#", "#nope", "#api/crawls", "#login", "#crawls/../logout", "#Crawls", "#crawls\nx"]) {
    assert.equal(pathFromHash(hash), undefined, hash);
  }
});

test("サインインへ回す URL は、戻り先を 1 つの値にして載せる", () => {
  assert.equal(loginHref(undefined), "/login");
  assert.equal(loginHref("/logout"), "/login");
  assert.equal(loginHref(`/crawls/${CRAWL}?from=ai`), `/login?back=%2Fcrawls%2F${CRAWL}%3Ffrom%3Dai`);
  // %2F が 1 段解けない（URLSearchParams で読み戻すと、元の字のまま）
  const href = loginHref("/history/https%3A%2F%2Fsandbox.test%2Fpricing");
  assert.equal(new URLSearchParams(href.split("?")[1]).get("back"), "/history/https%3A%2F%2Fsandbox.test%2Fpricing");
});
