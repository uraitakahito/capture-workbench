/**
 * 人の名乗り —— IdP のサインイン（authorization code と PKCE）と、そのトークンを持つセッション。
 *
 * ## 本番は Amazon Cognito、手元は代役の Floci
 *
 * capture-ledger はトークンを Cognito の形で確かめる。workbench は人の代わりに capture-ledger を叩くので、
 * 人に IdP のサインインの画面を通ってもらい、戻ってきた code を access token に替えて持つ。
 * 手元の IdP は capture-ledger の compose の Floci で、`pnpm run idp:bootstrap` が workbench 用の
 * app client（public・戻り先 `http://127.0.0.1:7080/callback`）を作る（CAPTURE-185）。
 *
 * ## この repo は秘密を持たない
 *
 * app client は **public**（secret を持たない）で、code の横取りは PKCE が防ぐ。トークンはメモリの
 * セッションにだけ置き、ブラウザには HttpOnly の cookie（セッションの ID）しか渡さない。
 * workbench を起こし直すとセッションは消え、次の要求でサインインの画面へ回る。
 *
 * ## 入出力
 *
 * IdP と話すのは `fetch` だけで、引数で受ける —— 試験は偽物を渡す（`test/auth.test.mjs`）。
 */
import { createHash, randomBytes } from "node:crypto";

/** セッションの cookie の名前。 */
export const SESSION_COOKIE = "workbench_session";

/** サインインの途中（authorize へ回してから callback に戻るまで）を覚えておく長さ。 */
const PENDING_MS = 10 * 60 * 1000;

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");

/** PKCE の verifier と、その S256 の challenge（RFC 7636）。 */
export const pkcePair = () => {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

/** `Cookie` の見出しから 1 つ読む。 */
export const cookieValue = (header, name) => {
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
};

/** セッションの cookie。HttpOnly・SameSite=Lax（IdP から戻る GET には付く）。消すときは maxAge 0。 */
export const sessionCookie = (id, maxAge = undefined) =>
  `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${String(maxAge)}`}`;

/**
 * JWT の中身を読む（**検証しない**）。画面に「誰としてサインインしているか」を出すためだけに使う ——
 * 署名を確かめるのは、トークンを受ける capture-ledger。
 */
export const claimsOf = (jwt) => {
  try {
    return JSON.parse(Buffer.from(String(jwt).split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
};

/** 画面に出す名乗り。Cognito の access token の `username` と `cognito:groups`。 */
export const whoOf = (accessToken) => {
  const claims = claimsOf(accessToken);
  return {
    user: typeof claims.username === "string" ? claims.username : String(claims.sub ?? "?"),
    groups: Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"].map(String) : [],
  };
};

/**
 * IdP とセッション。
 *
 * @param {{ issuer: string, clientId: string, redirectUri: string, fetch?: typeof fetch, now?: () => number }} options
 */
export const createAuth = ({ issuer, clientId, redirectUri, fetch: send = fetch, now = Date.now }) => {
  /** @type {Map<string, { verifier: string, at: number }>} state → verifier */
  const pending = new Map();
  /** @type {Map<string, { accessToken: string, refreshToken?: string }>} */
  const sessions = new Map();
  let discovery;

  const configured = issuer !== "" && clientId !== "";

  /** discovery を 1 度だけ読む（authorize と token のエンドポイント）。 */
  const endpoints = async () => {
    if (discovery !== undefined) return discovery;
    let res;
    try {
      res = await send(`${issuer}/.well-known/openid-configuration`);
    } catch (err) {
      throw new Error(
        `${issuer} に届かない (${err instanceof Error ? err.message : String(err)})。` +
          "capture-ledger で pnpm run dev:status の IdP の行を見る",
        { cause: err },
      );
    }
    if (!res.ok) {
      throw new Error(
        `${issuer} の discovery が ${String(res.status)} —— Floci のプールが作り直されたなら、` +
          "capture-ledger で pnpm run dev:up --from idp",
      );
    }
    const body = await res.json();
    if (typeof body.authorization_endpoint !== "string" || typeof body.token_endpoint !== "string") {
      throw new Error(`${issuer} の discovery に authorization_endpoint か token_endpoint が無い`);
    }
    discovery = { authorize: body.authorization_endpoint, token: body.token_endpoint };
    return discovery;
  };

  /** サインインの画面の URL。state と verifier を覚える。 */
  const beginLogin = async () => {
    const { authorize } = await endpoints();
    for (const [state, entry] of pending) if (now() - entry.at > PENDING_MS) pending.delete(state);
    const state = base64url(randomBytes(16));
    const { verifier, challenge } = pkcePair();
    pending.set(state, { verifier, at: now() });
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `${authorize}?${query.toString()}`;
  };

  const tokenRequest = async (params) => {
    const { token } = await endpoints();
    const res = await send(token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, ...params }).toString(),
    });
    const text = await res.text();
    if (!res.ok) return { error: `${String(res.status)} ${text.slice(0, 200)}` };
    const body = JSON.parse(text);
    return typeof body.access_token === "string"
      ? { accessToken: body.access_token, refreshToken: body.refresh_token }
      : { error: "token endpoint の答えに access_token が無い" };
  };

  /**
   * IdP から戻ってきた code をトークンに替え、セッションを作る。**state を照らす** ——
   * 知らない state（よそのページが作った callback・期限切れ・2 度目）は断る。
   *
   * @returns {Promise<{ session: string } | { error: string }>}
   */
  const finishLogin = async (code, state) => {
    const entry = typeof state === "string" ? pending.get(state) : undefined;
    if (entry === undefined || now() - entry.at > PENDING_MS) {
      return { error: "知らない state —— サインインをやり直す (/login)" };
    }
    pending.delete(state); // 1 度だけ
    if (typeof code !== "string" || code === "") return { error: "code が無い" };
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: entry.verifier,
    });
    if ("error" in tokens) return { error: `code をトークンに替えられない: ${tokens.error}` };
    const session = base64url(randomBytes(24));
    sessions.set(session, tokens);
    return { session };
  };

  /** セッションのトークン。無ければ undefined。 */
  const tokenOf = (session) => (session === undefined ? undefined : sessions.get(session));

  /**
   * refresh token で取り直す。取れなければセッションを消す（次はサインインへ回る）。
   *
   * @returns {Promise<boolean>}
   */
  const refresh = async (session) => {
    const held = tokenOf(session);
    if (held?.refreshToken === undefined) {
      sessions.delete(session);
      return false;
    }
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: held.refreshToken });
    if ("error" in tokens) {
      sessions.delete(session);
      return false;
    }
    // Cognito は refresh token を入れ替えないことがある。来なければ前の物を使い続ける。
    sessions.set(session, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? held.refreshToken });
    return true;
  };

  const logout = (session) => {
    if (session !== undefined) sessions.delete(session);
  };

  return { configured, beginLogin, finishLogin, tokenOf, refresh, logout };
};
