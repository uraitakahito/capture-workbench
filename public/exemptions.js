/**
 * robots.txt の例外の画面（t-6bc6）の、画面に依らない部分。capture-ledger の `GET /api/robots-exemptions` の行を並べて
 * 字にし、登録の本文を組み、答えを 1 行の文にするだけで、判断はしない —— 行が効いているか（`state`）も、欄の字の
 * 決まりも、誰が登録してよいかも、決めるのは capture-ledger。ブラウザは `/exemptions.js` として読み、試験は
 * `node --test` から import する。字は辞書（`i18n/*.json`）に在る。capture-ledger の断りの句は `errorText` が訳す
 * （`ledger.error.<句>`）。
 */
import { count } from "./format.js";
import { dateTime, errorText, t } from "./i18n.js";

export const EXEMPTIONS_PATH = "/api/robots-exemptions";

/** 取り消しのエンドポイント。本文は無い（`postJson` が `{}` を送る）。 */
export const revokePath = (id) => `${EXEMPTIONS_PATH}/${encodeURIComponent(id)}/revoke`;

/**
 * 画面の URL（`/exemptions[/<例外の番号>]`）。番号を載せると、その行に印が付く —— クロールの画面の「例外 #N」から来る。
 * 画面でなければ undefined。番号の形は見ない（一覧に無い番号は、画面がそう言う）。
 */
export const parseExemptionsHref = (pathname) => {
  const m = /^\/exemptions(?:\/([^/]+))?$/.exec(pathname);
  return m === null ? undefined : { id: m[1] };
};

/** `parseExemptionsHref` の逆。 */
export const exemptionsHref = (id) => (id === undefined ? "/exemptions" : `/exemptions/${encodeURIComponent(id)}`);

/** 状態の並び。効いている行が上、切れた行と取り消した行はその下。 */
const ORDER = ["active", "expired", "revoked"];
const rankOf = (row) => {
  const at = ORDER.indexOf(row.state);
  return at === -1 ? ORDER.length : at;
};

/**
 * 行を並べる。**状態の中の順は capture-ledger のまま**（登録の新しい順）—— 動かすのは状態の間だけ。知らない状態
 * （新しい capture-ledger）は、いちばん下に。
 */
export const sortExemptions = (rows) => [...rows].sort((a, b) => rankOf(a) - rankOf(b));

/** 人の名前。読める名前が無ければ、主体の ID。 */
const whoOf = (name, subject) => (typeof name === "string" && name !== "" ? name : String(subject ?? ""));

/** 登録した人。 */
export const createdByText = (row) => whoOf(row.createdByName, row.createdBy);

/**
 * 状態の字と色。**字で言い分ける**（色は添えるだけ）。取り消した行は、いつ・誰が取り消したかを `title` に持つ（欄の字は
 * 短いまま —— 状態は表の左の端に置き、狭い窓でも見えるようにする）。知らない状態は、届いた字のまま警告の色で。
 */
export const stateOf = (row) => {
  switch (row.state) {
    case "active":
      return { kind: "ok", text: t("exemptions.state.active") };
    case "expired":
      return { kind: "muted", text: t("exemptions.state.expired") };
    case "revoked":
      return {
        kind: "muted",
        text: t("exemptions.state.revoked"),
        ...(typeof row.revokedAt === "string" && {
          title: t("exemptions.state.revokedAt", {
            time: dateTime(new Date(row.revokedAt)),
            by: whoOf(row.revokedByName, row.revokedBy),
          }),
        }),
      };
    default:
      return { kind: "warn", text: String(row.state) };
  }
};

/** 範囲の字。知らない値は届いた字のまま。 */
export const scopeText = (scope) =>
  scope === "seeds" ? t("exemptions.scope.seeds") : scope === "links" ? t("exemptions.scope.links") : String(scope);

/** 当たるクロールの字。知らない値は届いた字のまま。 */
export const appliesText = (appliesTo) =>
  appliesTo === "all" ? t("exemptions.applies.all") : appliesTo === "human" ? t("exemptions.applies.human") : String(appliesTo);

/** 上限の字（1 日 / 1 クロールのリンク）。何の数かは列の見出しが言う。 */
export const limitsText = (row) => `${count(row.dailyLimit)} / ${count(row.linkLimit)}`;

/**
 * 24 時間で外した数の列を出すか。数は、外して撮りに行ったページで、撮れなかった物も含む（1 日の上限と同じ数え方 ——
 * 列の見出しと title がそう言う）。`usedLast24h` は capture-ledger v0.117.0 から —— どの行にも無ければ（それより前の
 * capture-ledger）、列ごと出さない。
 */
export const hasUsed = (rows) => rows.some((row) => typeof row.usedLast24h === "number");

/** 24 時間で外した枚数の字。数の無い行は「—」（0 とは別のこと）。 */
export const usedText = (row) => (typeof row.usedLast24h === "number" ? count(row.usedLast24h) : "—");

/** 期限の既定（30 日後）と、capture-ledger が受ける長さ（登録から 90 日まで。`src/exemptions/validate.ts`）。 */
const EXPIRES_DAYS = 30;
const EXPIRES_MAX_DAYS = 90;

const DAY_MS = 86_400_000;
const two = (n) => String(n).padStart(2, "0");
/** 日付の欄の字（`2026-11-28`）。この端末の時刻で読む。 */
const dateOf = (ms) => {
  const at = new Date(ms);
  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
};

/**
 * 期限の日付の欄の、選べる範囲と既定（`<input type="date">` の `min`・`value`・`max`）。既定は 30 日後。**上限は、
 * 90 日後の 1 日前** —— 送るのは選んだ日の終わり（`expiresAtOf`）なので、90 日後の日付を選ばせると、その日の終わりが
 * capture-ledger の「登録から 90 日まで」を超える。
 */
export const expiryDates = (now = Date.now()) => ({
  min: dateOf(now),
  value: dateOf(now + EXPIRES_DAYS * DAY_MS),
  max: dateOf(now + (EXPIRES_MAX_DAYS - 1) * DAY_MS),
});

/**
 * 選んだ日付を、capture-ledger に送る時刻にする。**その日の終わり**（この端末の時刻の 23:59:59）を、UTC の
 * ISO 8601（`…Z`）で —— capture-ledger は offset の無い字を受けない。日付として読めなければ undefined。
 */
export const expiresAtOf = (date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  if (m === null) return undefined;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
};

/** 数の欄。空なら送らない（capture-ledger の既定になる）。 */
const numberOf = (name, text) => (String(text).trim() === "" ? {} : { [name]: Number(text) });

/**
 * 登録の本文。`fields` は欄の字そのもの（`expires` は日付の欄の字）。**検査しない** —— 前後の空白を落とし、空の欄を
 * 送らないだけで、字の決まりは capture-ledger が 400 で言う（どの欄かは答えの `field`）。
 */
export const exemptionBody = (fields) => {
  const pathPattern = fields.pathPattern.trim();
  const expiresAt = expiresAtOf(fields.expires);
  return {
    orgId: fields.orgId,
    host: fields.host.trim(),
    ...(pathPattern !== "" && { pathPattern }),
    scope: fields.scope,
    appliesTo: fields.appliesTo,
    userAgent: fields.userAgent.trim(),
    reason: fields.reason.trim(),
    ...(expiresAt !== undefined && { expiresAt }),
    ...numberOf("dailyLimit", fields.dailyLimit),
    ...numberOf("linkLimit", fields.linkLimit),
  };
};

/**
 * 断りの 1 行。capture-ledger の句は辞書に在れば訳し（`errorText`）、無ければ届いた字のまま。`named` は capture-ledger が
 * 名指した物で、文の後ろに添える。`status` が 0 なのは、workbench のサーバ自身に届かなかったとき。
 */
const refusedText = (status, answer, named) => {
  const said = errorText(answer) ?? t("common.noText");
  if (status === 0) return t("common.unreachable", { said });
  return named === undefined
    ? t("exemptions.error.statusSaid", { status: String(status), said })
    : t("exemptions.error.statusSaidNamed", { status: String(status), said, named });
};

/**
 * 登録の答えの 1 行。断り（400・403・409）は、状態の数と capture-ledger の句の文で言う。400 は、どの欄かを `field` で
 * 返す（画面が、その欄の下に文を出す）。409 は、重なった行の番号か、そのホストの効いている行の User-Agent を後ろに添える。
 */
export const registerAnswer = (status, answer) => {
  if (status === 201) return { kind: "ok", text: t("exemptions.register.done", { id: String(answer.id) }) };
  const named =
    typeof answer.id === "string"
      ? t("exemptions.ref", { id: answer.id })
      : typeof answer.userAgent === "string"
        ? answer.userAgent
        : undefined;
  return {
    kind: "bad",
    text: refusedText(status, answer, named),
    ...(typeof answer.field === "string" && { field: answer.field }),
  };
};

/** 取り消しの答えの 1 行。 */
export const revokeAnswer = (status, answer) =>
  status === 200 ? { kind: "ok", text: t("exemptions.revoke.done") } : { kind: "bad", text: refusedText(status, answer) };

/**
 * 一覧を読めなかったときの文。エンドポイントの無い capture-ledger（v0.116.0 より前）の 404 は、capture-ledger の
 * 「見つからない」（`not found`）と言い分ける。
 */
export const listError = (status, body) =>
  status === 404 && body?.error !== "not found"
    ? t("exemptions.error.noRoute")
    : t("exemptions.error.statusSaid", { status: String(status), said: errorText(body) ?? t("common.noText") });
