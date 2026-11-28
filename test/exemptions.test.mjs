/**
 * robots.txt の例外の画面（`public/exemptions.js`）の、画面に依らない部分。capture-ledger の `GET /api/robots-exemptions` の行を
 * 並べて字にする形・登録の本文・答えの 1 行（t-6bc6）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { dateTime, setLang } from "../public/i18n.js";
import {
  appliesText,
  createdByText,
  exemptionBody,
  EXEMPTIONS_PATH,
  exemptionsHref,
  expiresAtOf,
  expiryDates,
  hasOrgs,
  hasUsed,
  limitsText,
  listError,
  parseExemptionsHref,
  registerAnswer,
  revokeAnswer,
  revokePath,
  scopeText,
  sortExemptions,
  stateOf,
  usedText,
} from "../public/exemptions.js";

/** 英語の画面で呼ぶ。終わったら日本語へ戻す（ほかの試験は日本語を期待する）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

/** capture-ledger v0.116.0 の行（`answerOf`）。 */
const exemption = (over = {}) => ({
  id: "12",
  orgId: "acme",
  host: "site.test",
  pathPattern: "/private/",
  scope: "links",
  appliesTo: "all",
  userAgent: "BrowserHive/1.0 (+https://site.test/bot)",
  reason: "持ち主の許しを受けた",
  dailyLimit: 100,
  linkLimit: 20,
  createdBy: "3f1c9a52-0000-4000-8000-00000000a11c",
  createdByName: "alice",
  createdAt: "2026-11-20T03:00:00.000Z",
  expiresAt: "2026-12-20T03:00:00.000Z",
  revokedAt: null,
  revokedBy: null,
  revokedByName: null,
  state: "active",
  ...over,
});

test("エンドポイントと画面の URL: 取り消しは番号を path に、画面は番号を載せても載せなくても開く", () => {
  assert.equal(EXEMPTIONS_PATH, "/api/robots-exemptions");
  assert.equal(revokePath("12"), "/api/robots-exemptions/12/revoke");
  assert.equal(exemptionsHref(), "/exemptions");
  assert.equal(exemptionsHref("12"), "/exemptions/12");
  assert.deepEqual(parseExemptionsHref("/exemptions"), { id: undefined });
  assert.deepEqual(parseExemptionsHref("/exemptions/12"), { id: "12" });
  // 番号の形は見ない（一覧に無い番号は、画面が「一覧にありません」と言う）
  assert.deepEqual(parseExemptionsHref("/exemptions/nope"), { id: "nope" });
  for (const path of ["/exemptions/12/revoke", "/exemptionsx", "/crawls", "/"]) {
    assert.equal(parseExemptionsHref(path), undefined, path);
  }
});

test("並び: 効いている行が上、切れた行・取り消した行はその下。状態の中の順は capture-ledger のまま", () => {
  const rows = [
    exemption({ id: "5", state: "revoked" }),
    exemption({ id: "4", state: "active" }),
    exemption({ id: "3", state: "someday" }),
    exemption({ id: "2", state: "expired" }),
    exemption({ id: "1", state: "active" }),
  ];
  assert.deepEqual(sortExemptions(rows).map((row) => row.id), ["4", "1", "2", "5", "3"]);
  // 元の並びは動かさない
  assert.deepEqual(rows.map((row) => row.id), ["5", "4", "3", "2", "1"]);
});

test("状態は字で言い分ける: 効いている・期限切れ・取り消し済み（いつ・誰がは title）。知らない状態は届いた字のまま", () => {
  assert.deepEqual(stateOf(exemption()), { kind: "ok", text: "効いている" });
  assert.deepEqual(stateOf(exemption({ state: "expired" })), { kind: "muted", text: "期限切れ" });
  const revoked = exemption({ state: "revoked", revokedAt: "2026-11-25T03:00:00.000Z", revokedBy: "sub-1", revokedByName: "bob" });
  const time = dateTime(new Date("2026-11-25T03:00:00.000Z"));
  // 欄の字は短く、いつ・誰が取り消したかは title に
  assert.deepEqual(stateOf(revoked), { kind: "muted", text: "取り消し済み", title: `取り消し済み（${time}・bob）` });
  // 名前の無い人は主体の ID
  assert.equal(stateOf({ ...revoked, revokedByName: null }).title, `取り消し済み（${time}・sub-1）`);
  assert.deepEqual(stateOf(exemption({ state: "revoked" })), { kind: "muted", text: "取り消し済み" });
  assert.deepEqual(stateOf(exemption({ state: "someday" })), { kind: "warn", text: "someday" });
  inEnglish(() => {
    assert.equal(stateOf(exemption()).text, "Active");
    assert.equal(stateOf(exemption({ state: "expired" })).text, "Expired");
    assert.equal(stateOf(revoked).text, "Revoked");
    assert.equal(stateOf(revoked).title, `Revoked (${dateTime(new Date("2026-11-25T03:00:00.000Z"))}, by bob)`);
  });
});

test("範囲・当たるクロール・登録した人・上限の字。知らない値は届いた字のまま", () => {
  assert.deepEqual(["seeds", "links", "later"].map(scopeText), ["起点だけ", "辿ったリンクも", "later"]);
  assert.deepEqual(["all", "human", "later"].map(appliesText), ["すべて", "人が始めた物だけ", "later"]);
  assert.deepEqual(inEnglish(() => ["seeds", "links"].map(scopeText)), ["Seeds only", "Followed links too"]);
  assert.deepEqual(inEnglish(() => ["all", "human"].map(appliesText)), ["All crawls", "Crawls started by a person only"]);
  assert.equal(createdByText(exemption()), "alice");
  // 名前が無ければ主体の ID
  assert.equal(createdByText(exemption({ createdByName: null })), "3f1c9a52-0000-4000-8000-00000000a11c");
  assert.equal(limitsText(exemption({ dailyLimit: 10000, linkLimit: 20 })), "10,000 / 20");
});

test("24 時間で外した数は、欄の在る capture-ledger（v0.117.0 から）の時だけ列にする。数の無い行は「—」", () => {
  assert.equal(hasUsed([exemption(), exemption()]), false);
  assert.equal(hasUsed([]), false);
  assert.equal(hasUsed([exemption(), exemption({ usedLast24h: 0 })]), true);
  assert.equal(usedText(exemption({ usedLast24h: 0 })), "0");
  assert.equal(usedText(exemption({ usedLast24h: 1204 })), "1,204");
  assert.equal(usedText(exemption()), "—");
});

test("期限の日付: 既定は 30 日後、選べるのは今日から、送るのはその日の終わり。上限の日の終わりも 90 日の内", () => {
  const DAY = 86_400_000;
  // この端末の時刻で、1 日の始まり・昼・終わりの際
  for (const now of [new Date(2026, 10, 28, 0, 0, 1), new Date(2026, 10, 28, 12, 0, 0), new Date(2026, 10, 28, 23, 59, 58)]) {
    const dates = expiryDates(now.getTime());
    assert.equal(dates.min, "2026-11-28");
    assert.equal(dates.value, "2026-12-28");
    const last = Date.parse(expiresAtOf(dates.max));
    assert.ok(last <= now.getTime() + 90 * DAY, `${dates.max} の終わりが 90 日を超える`);
    // 1 日あとを選ばせる余りは無い（上限を狭めすぎていない）
    assert.ok(last + DAY > now.getTime() + 89 * DAY);
    assert.ok(Date.parse(expiresAtOf(dates.min)) > now.getTime() - 2000, "今日の終わりは今より後");
  }
  // 送る字は offset つき（UTC の Z）で、この端末の時刻で選んだ日の 23:59:59
  const sent = expiresAtOf("2026-12-28");
  assert.match(sent, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const at = new Date(sent);
  assert.deepEqual(
    [at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes(), at.getSeconds()],
    [2026, 12, 28, 23, 59, 59],
  );
  for (const text of ["", "2026/12/28", "12-28", undefined]) assert.equal(expiresAtOf(text), undefined, String(text));
});

test("登録の本文: 前後の空白を落とし、空の欄は送らない（capture-ledger の既定になる）。字は検査しない", () => {
  const fields = {
    orgId: "acme",
    host: " Site.test ",
    pathPattern: " /private/ ",
    scope: "links",
    appliesTo: "human",
    userAgent: " BrowserHive/1.0 ",
    reason: " 持ち主の許しを受けた\n",
    expires: "2026-12-28",
    dailyLimit: "50",
    linkLimit: "5",
  };
  assert.deepEqual(exemptionBody(fields), {
    orgId: "acme",
    host: "Site.test",
    pathPattern: "/private/",
    scope: "links",
    appliesTo: "human",
    userAgent: "BrowserHive/1.0",
    reason: "持ち主の許しを受けた",
    expiresAt: expiresAtOf("2026-12-28"),
    dailyLimit: 50,
    linkLimit: 5,
  });
  const bare = exemptionBody({ ...fields, pathPattern: "", expires: "", dailyLimit: "", linkLimit: " " });
  assert.deepEqual(Object.keys(bare), ["orgId", "host", "scope", "appliesTo", "userAgent", "reason"]);
  // 整数でない数も、そのまま送る（capture-ledger が言う）
  assert.equal(exemptionBody({ ...fields, dailyLimit: "1.5" }).dailyLimit, 1.5);
  // 鍵は capture-ledger の schema の properties だけ（知らない鍵は 400）
  const allowed = ["orgId", "host", "pathPattern", "scope", "appliesTo", "userAgent", "reason", "expiresAt", "dailyLimit", "linkLimit"];
  for (const key of Object.keys(exemptionBody(fields))) assert.ok(allowed.includes(key), key);
});

test("登録の答え: 201 は番号を言い、400 は句の文と欄の名前、403 は句の文、409 は重なった行の番号か今の User-Agent を添える", () => {
  assert.deepEqual(registerAnswer(201, exemption()), { kind: "ok", text: "登録しました（例外 #12）。" });
  assert.deepEqual(registerAnswer(400, { error: "reason must not be blank", field: "reason" }), {
    kind: "bad",
    text: "400 —— 理由が空です",
    field: "reason",
  });
  assert.deepEqual(registerAnswer(403, { error: "not an organization admin" }), { kind: "bad", text: "403 —— 組織の admin ではありません" });
  assert.equal(
    registerAnswer(403, { error: "machine identities cannot manage robots exemptions" }).text,
    "403 —— 機械の主体（client credentials）は、robots.txt の例外を登録・取り消しできません",
  );
  assert.equal(
    registerAnswer(403, { error: "robots exemptions are not available with header identities" }).text,
    "403 —— ヘッダで名乗る capture-ledger では、robots.txt の例外を登録・取り消しできません",
  );
  assert.equal(
    registerAnswer(409, { error: "an active robots exemption already covers this host and path pattern", id: "7" }).text,
    "409 —— 同じホストと path の型で、効いている例外がもう在ります: 例外 #7",
  );
  assert.equal(
    registerAnswer(409, { error: "active robots exemptions for this host use a different user agent", userAgent: "BrowserHive/2.0" }).text,
    "409 —— このホストの効いている例外は、別の User-Agent を使っています: BrowserHive/2.0",
  );
  // schema の 400（Fastify の定型）は message を、辞書に無い句は届いた字のまま
  assert.equal(
    registerAnswer(400, { statusCode: 400, error: "Bad Request", message: "body/dailyLimit must be integer" }).text,
    "400 —— body/dailyLimit must be integer",
  );
  assert.equal(registerAnswer(400, { error: "host is on a deny list", field: "host" }).text, "400 —— host is on a deny list");
  // サインインが切れた（workbench の 401）・workbench に届かない・文の無い答え
  assert.equal(registerAnswer(401, { error: "sign-in expired", login: "/login" }).text, "401 —— サインインが切れました");
  assert.equal(registerAnswer(0, { error: "Failed to fetch" }).text, "workbench 自身に届きません（Failed to fetch）");
  assert.equal(registerAnswer(500, {}).text, "500 —— 答えに文がありません");
  inEnglish(() => {
    assert.equal(registerAnswer(201, exemption()).text, "Registered (exemption #12).");
    assert.equal(registerAnswer(403, { error: "not an organization admin" }).text, "403 — Not an organization admin");
    assert.equal(
      registerAnswer(409, { error: "an active robots exemption already covers this host and path pattern", id: "7" }).text,
      "409 — An active exemption already covers this host and path pattern: exemption #7",
    );
  });
});

test("取り消しの答え: 200 は、いつから効くかを言う。断りは句の文", () => {
  assert.deepEqual(revokeAnswer(200, exemption({ state: "revoked" })), { kind: "ok", text: "取り消しました。次に送る段から効きます。" });
  assert.deepEqual(revokeAnswer(409, { error: "robots exemption is already revoked" }), { kind: "bad", text: "409 —— この例外は、もう取り消してあります" });
  assert.equal(revokeAnswer(409, { error: "robots exemption has already expired" }).text, "409 —— この例外は、もう期限が切れています");
  assert.equal(revokeAnswer(404, { error: "not found" }).text, "404 —— 見つかりません");
  assert.equal(revokeAnswer(403, { error: "not an organization admin" }).text, "403 —— 組織の admin ではありません");
  assert.equal(inEnglish(() => revokeAnswer(409, { error: "robots exemption is already revoked" }).text), "409 — The exemption is already revoked");
});

test("一覧を読めないとき: エンドポイントの無い capture-ledger の 404 は、そう言う。ほかは状態と句の文", () => {
  const noRoute = { statusCode: 404, error: "Not Found", message: "Route GET:/api/robots-exemptions not found" };
  assert.equal(listError(404, noRoute), "この capture-ledger は robots.txt の例外を返しません（v0.116.0 より前）");
  assert.equal(listError(404, { error: "not found" }), "404 —— 見つかりません");
  assert.equal(listError(502, { error: "ledger unreachable", params: { url: "http://127.0.0.1:7070", cause: "ECONNREFUSED" } }).startsWith("502 —— "), true);
  assert.equal(listError(500, {}), "500 —— 答えに文がありません");
});

test("hasOrgs: 行の組織が 2 つ以上ある時だけ、組織の列を出す", () => {
  assert.equal(hasOrgs([]), false);
  assert.equal(hasOrgs([exemption(), exemption({ id: "13" })]), false);
  assert.equal(hasOrgs([exemption(), exemption({ id: "13", orgId: "globex" })]), true);
});
