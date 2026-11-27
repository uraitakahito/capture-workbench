/**
 * クロールを誰が・どこから始めたかの字（CAPTURE-450）の、画面に依らない部分。capture-ledger の `GET /api/crawls` の行と
 * `GET /api/crawls/:id` の答えが持つ欄を、一覧の「始めた人」と、開いた行の 1 行と、出どころで絞る chip にするだけ。
 * ブラウザは `/requester.js` として読み、試験は `node --test` から import する。字は辞書（`i18n/*.json`）に在る。
 *
 * capture-ledger が残すのは 5 つ。`requestedBy`（主体の ID。認可に使う物）のほかは、読むための写し:
 * `requestedByName`（読める名前）・`requestedClient`（どの app client のトークンか）・`requestedActor`（呼び手が
 * 自分で書いた名前。**確かめていない**ので「申告」と書いて出す）・`runRequestedByName`（定期の回の「いま撮る」を
 * 押した者）。古い capture-ledger（v0.112.0 より前）と、それより前の行は、写しを持たない —— そのときは今までどおり
 * 主体の ID を出す。
 */
import { t } from "./i18n.js";

/** 欄が無い（古い capture-ledger）のも null（分からない行）のも、同じ「無い」。 */
const has = (value) => typeof value === "string" && value !== "";

/**
 * 一覧の「始めた人」の字。名前が在れば名前、無ければ主体の ID。組織は今までどおり後ろに付ける。
 * `title` は主体の ID（名前を出したときだけ。名前は表示のための写しで、認可に使うのは ID）。
 */
export const whoOf = (crawl) => {
  const named = has(crawl.requestedByName);
  return {
    text: `${named ? crawl.requestedByName : crawl.requestedBy} / ${crawl.orgId}`,
    ...(named && { title: t("crawls.who.idTitle", { id: crawl.requestedBy }) }),
  };
};

/**
 * 名前の後ろに付ける印。app client の名前・申告の席の名前・「いま撮る」を押した者の順。無い物は出さない。
 * `kind` は見た目の class（`client`・`actor`・`pressed`）。
 */
export const whoMarks = (crawl) => {
  const marks = [];
  if (has(crawl.requestedClient)) {
    marks.push({
      kind: "client",
      text: crawl.requestedClient,
      title: t("crawls.who.clientTitle", { client: crawl.requestedClient }),
    });
  }
  if (has(crawl.requestedActor)) {
    marks.push({
      kind: "actor",
      text: t("crawls.who.actor", { actor: crawl.requestedActor }),
      title: t("crawls.who.actorTitle"),
    });
  }
  // 押した者の名前が分からなければ、主体の ID で出す（押したことは分かっている）
  const pressed = has(crawl.runRequestedByName) ? crawl.runRequestedByName : crawl.runRequestedBy;
  if (has(pressed)) {
    marks.push({
      kind: "pressed",
      text: t("crawls.who.pressed", { name: pressed }),
      title: t("crawls.who.pressedTitle"),
    });
  }
  return marks;
};

/** 出どころの鍵。定期の回は `schedule`、app client の名前が在ればその名前、どちらも無ければ `unknown`。 */
export const ORIGIN_ALL = "";
export const ORIGIN_SCHEDULE = "schedule";
export const ORIGIN_UNKNOWN = "unknown";
export const originOf = (crawl) => {
  if (crawl.schedule !== null && crawl.schedule !== undefined) return ORIGIN_SCHEDULE;
  // app client の名前を、鍵の語と取り違えないように頭を付ける（`schedule` という名前の client が在ってもよい）
  return has(crawl.requestedClient) ? `client:${crawl.requestedClient}` : ORIGIN_UNKNOWN;
};

/**
 * 出どころで絞る chip。引いた一覧に在る出どころだけを並べる（app client の名前は配備の設定なので、決め打ちにしない）。
 * 出どころが 1 種類だけなら、絞る意味が無いので何も出さない。並びは「すべて」・app client（名前の順）・定期・不明。
 */
export const originChips = (crawls) => {
  const counts = new Map();
  for (const crawl of crawls) {
    const origin = originOf(crawl);
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  if (counts.size < 2) return [];
  const clients = [...counts.keys()].filter((origin) => origin.startsWith("client:")).sort();
  const chips = [{ id: ORIGIN_ALL, text: t("crawls.filter.all", { n: crawls.length }) }];
  for (const origin of clients) {
    chips.push({
      id: origin,
      text: t("crawls.filter.client", { client: origin.slice("client:".length), n: counts.get(origin) }),
    });
  }
  if (counts.has(ORIGIN_SCHEDULE)) {
    chips.push({ id: ORIGIN_SCHEDULE, text: t("crawls.filter.schedule", { n: counts.get(ORIGIN_SCHEDULE) }) });
  }
  if (counts.has(ORIGIN_UNKNOWN)) {
    chips.push({ id: ORIGIN_UNKNOWN, text: t("crawls.filter.unknown", { n: counts.get(ORIGIN_UNKNOWN) }) });
  }
  return chips;
};

/** 選んだ出どころの行だけ。「すべて」と、一覧にもう無い出どころは、全部を返す（引き直しで行が消えても空にしない）。 */
export const withOrigin = (crawls, origin) => {
  if (origin === ORIGIN_ALL) return crawls;
  const shown = crawls.filter((crawl) => originOf(crawl) === origin);
  return shown.length === 0 ? crawls : shown;
};

/**
 * 開いた行の 1 行。1 本の答えが主体の ID を持たなければ（v0.112.0 より前の capture-ledger）undefined で、行を出さない。
 * 一覧と同じ物を、省かずに文で言う。
 */
export const startedByLine = (one) => {
  if (!has(one.requestedBy)) return undefined;
  const parts = [
    has(one.requestedByName)
      ? t("crawls.detail.byNamed", { name: one.requestedByName, id: one.requestedBy })
      : t("crawls.detail.byId", { id: one.requestedBy }),
  ];
  if (has(one.orgId)) parts.push(t("crawls.detail.byOrg", { org: one.orgId }));
  if (has(one.requestedClient)) parts.push(t("crawls.detail.byClient", { client: one.requestedClient }));
  if (has(one.requestedActor)) parts.push(t("crawls.detail.byActor", { actor: one.requestedActor }));
  const pressed = has(one.runRequestedByName) ? one.runRequestedByName : one.runRequestedBy;
  if (has(pressed)) parts.push(t("crawls.detail.byPressed", { name: pressed }));
  return t("crawls.detail.startedBy", { who: parts.join(t("crawls.detail.bySeparator")) });
};
