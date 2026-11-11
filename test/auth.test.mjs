/**
 * 人の名乗り（`src/auth.mjs`）。IdP は偽物を渡す —— 本物の Floci での往復は capture-ledger の dev:up の上で見る。
 *
 * 見るのは、よそのページが作った戻りを断るか（state）、code を替えるときに PKCE の verifier を
 * 正しく渡すか、取り直しに失敗したらセッションを消すか。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { claimsOf, cookieValue, createAuth, pkcePair, sessionCookie, whoOf } from "../src/auth.mjs";

const ISSUER = "http://idp.test:4566/us-east-1_example";
const jwt = (claims) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

/** 偽の IdP。discovery と token endpoint に答え、token endpoint への頼みを記録する。 */
const fakeIdp = ({ token = () => ({ status: 200, body: { access_token: "access-1", refresh_token: "refresh-1" } }) } = {}) => {
  const seen = [];
  const send = async (url, init = {}) => {
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return new Response(
        JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: "http://idp.test:4566/cognito-idp/oauth2/authorize",
          token_endpoint: "http://idp.test:4566/cognito-idp/oauth2/token",
        }),
      );
    }
    if (url === "http://idp.test:4566/cognito-idp/oauth2/token") {
      const params = Object.fromEntries(new URLSearchParams(String(init.body)));
      seen.push(params);
      const answer = token(params);
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }
    return new Response("not found", { status: 404 });
  };
  return { send, seen };
};

const setup = (idp = fakeIdp()) => ({
  idp,
  auth: createAuth({
    issuer: ISSUER,
    clientId: "web-client",
    redirectUri: "http://127.0.0.1:7080/callback",
    fetch: idp.send,
  }),
});

test("PKCE の challenge は verifier の SHA-256 (base64url)", () => {
  const { verifier, challenge } = pkcePair();
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  assert.ok(verifier.length >= 43, "RFC 7636 の最短は 43 字");
});

test("サインインの画面の URL に、client・戻り先・state・S256 の challenge を載せる", async () => {
  const { auth } = setup();
  const url = new URL(await auth.beginLogin());
  assert.equal(url.origin + url.pathname, "http://idp.test:4566/cognito-idp/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "web-client");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:7080/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok((url.searchParams.get("state") ?? "").length > 0);
});

test("戻ってきた code を、覚えた verifier で替え、セッションを作る", async () => {
  const { auth, idp } = setup();
  const url = new URL(await auth.beginLogin());
  const done = await auth.finishLogin("the-code", url.searchParams.get("state"));
  assert.ok("session" in done);
  const [sent] = idp.seen;
  assert.equal(sent.grant_type, "authorization_code");
  assert.equal(sent.code, "the-code");
  assert.equal(sent.client_id, "web-client");
  assert.equal(sent.redirect_uri, "http://127.0.0.1:7080/callback");
  // verifier は、URL に載せた challenge の元でなければならない
  assert.equal(
    createHash("sha256").update(sent.code_verifier).digest("base64url"),
    url.searchParams.get("code_challenge"),
  );
  assert.equal(auth.tokenOf(done.session)?.accessToken, "access-1");
});

test("知らない state の戻りは断り、IdP に code を送らない", async () => {
  const { auth, idp } = setup();
  await auth.beginLogin();
  const done = await auth.finishLogin("the-code", "made-up-state");
  assert.ok("error" in done);
  assert.deepEqual(idp.seen, []);
});

test("同じ state の 2 度目の戻りは断る", async () => {
  const { auth } = setup();
  const state = new URL(await auth.beginLogin()).searchParams.get("state");
  assert.ok("session" in (await auth.finishLogin("c1", state)));
  assert.ok("error" in (await auth.finishLogin("c2", state)));
});

test("IdP が code を断れば、セッションを作らない", async () => {
  const { auth } = setup(fakeIdp({ token: () => ({ status: 400, body: { error: "invalid_grant" } }) }));
  const state = new URL(await auth.beginLogin()).searchParams.get("state");
  const done = await auth.finishLogin("bad", state);
  assert.ok("error" in done);
  assert.match(done.error, /invalid_grant/);
});

test("refresh token で取り直す。断られたらセッションを消す", async () => {
  let answer = { status: 200, body: { access_token: "access-1", refresh_token: "refresh-1" } };
  const { auth, idp } = setup(fakeIdp({ token: () => answer }));
  const state = new URL(await auth.beginLogin()).searchParams.get("state");
  const { session } = await auth.finishLogin("c", state);

  answer = { status: 200, body: { access_token: "access-2" } };
  assert.equal(await auth.refresh(session), true);
  assert.equal(auth.tokenOf(session)?.accessToken, "access-2");
  // refresh token が来なければ、前の物を使い続ける
  assert.equal(auth.tokenOf(session)?.refreshToken, "refresh-1");
  assert.equal(idp.seen.at(-1)?.grant_type, "refresh_token");

  answer = { status: 400, body: { error: "invalid_grant" } };
  assert.equal(await auth.refresh(session), false);
  assert.equal(auth.tokenOf(session), undefined);
});

test("セッションの無い取り直しは、IdP に訊かずに false", async () => {
  const { auth, idp } = setup();
  assert.equal(await auth.refresh("nobody"), false);
  assert.deepEqual(idp.seen, []);
});

test("サインアウトでセッションが消える", async () => {
  const { auth } = setup();
  const state = new URL(await auth.beginLogin()).searchParams.get("state");
  const { session } = await auth.finishLogin("c", state);
  auth.logout(session);
  assert.equal(auth.tokenOf(session), undefined);
});

test("設定が無ければ configured は false", () => {
  assert.equal(createAuth({ issuer: "", clientId: "x", redirectUri: "r" }).configured, false);
  assert.equal(createAuth({ issuer: ISSUER, clientId: "", redirectUri: "r" }).configured, false);
});

test("cookie を読む・書く", () => {
  assert.equal(cookieValue("a=1; workbench_session=abc; b=2", "workbench_session"), "abc");
  assert.equal(cookieValue(undefined, "workbench_session"), undefined);
  assert.match(sessionCookie("abc"), /^workbench_session=abc; Path=\/; HttpOnly; SameSite=Lax$/);
  assert.match(sessionCookie("", 0), /Max-Age=0$/);
});

test("画面に出す名乗りは username と cognito:groups (検証はしない —— するのは capture-ledger)", () => {
  assert.deepEqual(whoOf(jwt({ username: "alice", "cognito:groups": ["acme"] })), {
    user: "alice",
    groups: ["acme"],
  });
  assert.deepEqual(whoOf(jwt({ sub: "s-1" })), { user: "s-1", groups: [] });
  assert.deepEqual(claimsOf("not-a-jwt"), {});
});
