/**
 * 定期実行の画面（CAPTURE-174）の、画面に依らない部分。capture-ledger の `GET /api/schedules` の答えを、状態の字・帯の文・回の行に
 * するだけで、判定はしない —— 状態の語（`health`）を決めるのは capture-ledger で、ここは語を文にする。ブラウザは `/schedules.js` と
 * して読み、試験は `node --test` から import する。字は辞書（`i18n/*.json`）に在り、ここは鍵を選んで `t()` に渡す。
 *
 * 帯を出すのは 3 つの語と、読めないときだけ。順番待ち（`blocked`）は待っているだけなので出さない。頁の一部だけ失敗した回は
 * 回の欄に「一部失敗」と出し、帯には出さない —— 同じサイトが毎日落ちると帯が出続け、誰も見なくなる。
 */
import { t } from "./i18n.js";
import { startAnswer } from "./start.js";

export const SCHEDULES_PATH = "/api/schedules";

/** 帯に出す状態の語。 */
const BAND = new Set(["stuck", "overdue", "failing"]);

/** 速く引く間隔と、ふだんの間隔。順番待ちや「いま撮る」の結果を待つ間だけ速く引く。 */
const FAST_MS = 5_000;
const SLOW_MS = 30_000;

/** cron の見本の式。 */
const PRESET_CRONS = ["0 4 * * *", "0 4 * * 1"];

/** 曜日の字。cron の番号（0 が日曜）の順。 */
const WEEKDAYS = [
  () => t("schedules.weekday.sun"),
  () => t("schedules.weekday.mon"),
  () => t("schedules.weekday.tue"),
  () => t("schedules.weekday.wed"),
  () => t("schedules.weekday.thu"),
  () => t("schedules.weekday.fri"),
  () => t("schedules.weekday.sat"),
];
const two = (n) => String(n).padStart(2, "0");

/** よく使う形の cron を言葉にする。ほかの形は式のまま。 */
export const cronWords = (cron) => {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(String(cron));
  if (m === null) return String(cron);
  const time = `${two(m[2])}:${two(m[1])}`;
  return m[3] === "*"
    ? t("schedules.cron.daily", { time })
    : t("schedules.cron.weekly", { weekday: WEEKDAYS[Number(m[3])](), time });
};

/** cron の見本（字と式）。欄に書き写すだけで、ほかの式も書ける。字は式を言葉にした物。 */
export const cronPresets = () => PRESET_CRONS.map((cron) => ({ label: cronWords(cron), cron }));

/** 予定の時刻の短い形（`11-08 04:00`）。予定の時差で読む。 */
export const shortTime = (iso, timeZone = "Asia/Tokyo") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const of = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${of("month")}-${of("day")} ${of("hour")}:${of("minute")}`;
};

/** 長さの字。分・時間・日のどれか 1 つで言う（遅れの大きさが分かれば足りる）。 */
export const spanText = (ms) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return t("schedules.span.minutes", { n: Math.max(minutes, 0) });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t("schedules.span.hours", { n: hours });
  return t("schedules.span.days", { n: Math.floor(hours / 24) });
};

/** 待っている物の時刻。頼みが在れば、期限と頼みの早い方。 */
const dueOf = (schedule) => {
  const next = Date.parse(schedule.nextRunAt);
  return schedule.runRequestedAt === null ? next : Math.min(next, Date.parse(schedule.runRequestedAt));
};

/** 回が走ったままの長さ。 */
const stuckFor = (schedule, now) =>
  spanText(now - Date.parse(schedule.recentRuns[0]?.startedAt ?? new Date(now).toISOString()));

/** 次の回の遅れの長さ。 */
const lateBy = (schedule, now) => spanText(now - dueOf(schedule));

/** 状態の字と色。色の種類は `.state` の `ok`・`run`・`bad` と、無し（止めている）。 */
export const healthOf = (schedule, now = Date.now()) => {
  switch (schedule.health) {
    case "paused":
      return { kind: "", text: t("schedules.health.paused") };
    case "stuck":
      return { kind: "bad", text: t("schedules.health.stuck", { span: stuckFor(schedule, now) }) };
    case "overdue":
      return { kind: "bad", text: t("schedules.health.overdue", { span: lateBy(schedule, now) }) };
    case "failing":
      return { kind: "bad", text: t("schedules.health.failing") };
    case "blocked":
      return {
        kind: "run",
        text: schedule.blockedBy === null ? t("schedules.health.blockedQuiet") : t("schedules.health.blockedByCrawl"),
      };
    default:
      return { kind: "ok", text: t("schedules.health.ok") };
  }
};

/** 失敗の理由を 1 行にする。長ければ切る（全文は回の行の詳しい所に在る）。 */
const briefly = (text) => {
  const line = String(text).split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
};

/** 帯に出す予定 1 つの文。失敗の理由は capture-ledger の字のまま添える。 */
const bandLine = (schedule, now) => {
  const name = schedule.name;
  if (schedule.health === "stuck") return t("schedules.band.stuck", { name, span: stuckFor(schedule, now) });
  if (schedule.health === "overdue") return t("schedules.band.overdue", { name, span: lateBy(schedule, now) });
  const error = schedule.recentRuns[0]?.error;
  return typeof error === "string" && error !== ""
    ? t("schedules.band.failingWith", { name, error: briefly(error) })
    : t("schedules.band.failing", { name });
};

/**
 * 帯の文。`readError` は最後の読み取りの失敗で、読めないことを「何も起きていない」と取り違えないために一緒に言う。
 * 何も無ければ undefined（帯を隠す）。**手で閉じない** —— 原因が直ると消える。
 */
export const bandOf = (schedules, readError, now = Date.now()) => {
  if (readError !== undefined) return t("schedules.band.unreadable", { said: readError });
  const lines = schedules.filter((schedule) => BAND.has(schedule.health)).map((schedule) => bandLine(schedule, now));
  return lines.length === 0 ? undefined : lines.join(t("common.sep.slash"));
};

/** タブに出す数。帯に出ている予定の数。 */
export const troubleCount = (schedules) => schedules.filter((schedule) => BAND.has(schedule.health)).length;

/** 次の読み取りまで。待っている物があれば速く引く。 */
export const pollMs = (schedules) =>
  schedules.some(
    (schedule) =>
      schedule.runRequestedAt !== null ||
      schedule.health === "blocked" ||
      schedule.recentRuns[0]?.state === "running",
  )
    ? FAST_MS
    : SLOW_MS;

/** 回の結果の字と色。 */
export const runResult = (run) => {
  if (run.state === "running") return { kind: "run", text: t("schedules.run.running") };
  if (run.state === "failed") return { kind: "bad", text: t("schedules.run.failed") };
  if (run.pagesFailed > 0) {
    return {
      kind: "warn",
      text: t("schedules.run.partly", { captured: run.pagesCaptured, failed: run.pagesFailed }),
    };
  }
  return { kind: "ok", text: t("schedules.run.captured", { n: run.pagesCaptured }) };
};

/** 回がいつの物か。本来の時刻が無いのは「いま撮る」の回。 */
export const runWhen = (run, timeZone) =>
  run.scheduledFor === null ? t("schedules.run.now") : shortTime(run.scheduledFor, timeZone);

/** 本来の時刻からの遅れ。1 分未満は言わない。 */
export const runDelay = (run) => {
  if (run.scheduledFor === null) return "";
  const ms = Date.parse(run.startedAt) - Date.parse(run.scheduledFor);
  return ms < 60_000 ? "" : t("schedules.run.delay", { span: spanText(ms) });
};

/** 1 回にまとめた欠けの字。無ければ空。 */
export const runMissed = (run) => (run.scheduleMissed > 0 ? t("schedules.run.missed", { n: run.scheduleMissed }) : "");

/** 撮り方の字（`autoscroll@2`）。新しい版が出ていれば後ろに添える。 */
export const scriptsText = (schedule) =>
  schedule.scripts.length === 0
    ? t("schedules.scripts.none")
    : schedule.scripts
        .map((script) =>
          script.latest !== null && script.latest > script.version
            ? t("schedules.scripts.newer", { id: script.id, version: script.version, latest: script.latest })
            : `${script.id}@${String(script.version)}`,
        )
        .join(t("common.sep.dot"));

/** 締めるボタンの相手。止まった回か、遅れの元の走行中の行。走っているだけ（`blocked`）の行は締めさせない。 */
export const closableCrawl = (schedule) =>
  (schedule.health === "stuck" || schedule.health === "overdue") && schedule.blockedBy !== null
    ? schedule.blockedBy.crawlId
    : undefined;

/** クロールの行の印。手で始めた行には付けない。 */
export const markOf = (crawl) => {
  if (crawl.schedule === null || crawl.schedule === undefined) return undefined;
  const name = crawl.schedule.name;
  const n = crawl.scheduleMissed;
  if (crawl.scheduledFor === null) {
    return n > 0
      ? { text: t("schedules.mark.missed", { n }), title: t("schedules.mark.titleNowMissed", { name, n }) }
      : { text: t("schedules.mark.plain"), title: t("schedules.mark.titleNow", { name }) };
  }
  const time = shortTime(crawl.scheduledFor);
  return n > 0
    ? { text: t("schedules.mark.missed", { n }), title: t("schedules.mark.titleDueMissed", { name, time, n }) }
    : { text: t("schedules.mark.plain"), title: t("schedules.mark.titleDue", { name, time }) };
};

/** 予定を作る本文。`request` は始める欄の本文（`startBody`）そのもの。 */
export const createBody = (name, cron, request) => ({ name: name.trim(), cron: cron.trim(), request });

/** 作った答えの 1 行。頼みの中身の断りは、始めるエンドポイントと同じ文にする（`startAnswer`）。 */
export const createAnswer = (status, answer) => {
  if (status === 201) {
    return {
      kind: "ok",
      text: t("schedules.create.made", { time: shortTime(answer.nextRunAt, answer.timezone) }),
    };
  }
  if (status === 409) return { kind: "bad", text: t("schedules.create.sameName") };
  if (answer.error === "invalid cron") {
    return { kind: "bad", text: t("schedules.create.invalidCron", { hint: String(answer.hint ?? "") }) };
  }
  if (answer.error === "cron runs too often") {
    return {
      kind: "bad",
      text: t("schedules.create.tooOften", {
        gap: String(answer.gapMinutes),
        min: String(answer.minIntervalMinutes),
      }),
    };
  }
  return startAnswer(status, answer);
};

/** 済んだ操作の文。引くときに `t()` を呼ぶ。 */
const DONE = {
  pause: () => t("schedules.done.pause"),
  resume: () => t("schedules.done.resume"),
  run: () => t("schedules.done.run"),
  repin: () => t("schedules.done.repin"),
  delete: () => t("schedules.done.delete"),
  close: () => t("schedules.done.close"),
};

/** 操作の答えの 1 行。断られたら、capture-ledger の文をそのまま出す。 */
export const actionAnswer = (action, status, answer) => {
  if (status >= 200 && status < 300) return { kind: "ok", text: DONE[action]?.() ?? t("schedules.done.other") };
  return startAnswer(status, answer);
};
