/**
 * 定期実行の画面（CAPTURE-174）の、画面に依らない部分。capture-ledger の `GET /api/schedules` の答えを、状態の字・帯の文・回の行に
 * するだけで、判定はしない —— 状態の語（`health`）を決めるのは capture-ledger で、ここは語を文にする。ブラウザは `/schedules.js` と
 * して読み、試験は `node --test` から import する。
 *
 * 帯を出すのは 3 つの語と、読めないときだけ。順番待ち（`blocked`）は待っているだけなので出さない。頁の一部だけ失敗した回は
 * 回の欄に「一部失敗」と出し、帯には出さない —— 同じサイトが毎日落ちると帯が出続け、誰も見なくなる。
 */
import { startAnswer } from "./start.js";

export const SCHEDULES_PATH = "/api/schedules";

/** 帯に出す状態の語。 */
const BAND = new Set(["stuck", "overdue", "failing"]);

/** 速く引く間隔と、ふだんの間隔。順番待ちや「いま撮る」の結果を待つ間だけ速く引く。 */
const FAST_MS = 5_000;
const SLOW_MS = 30_000;

/** cron の見本。欄に書き写すだけで、ほかの式も書ける。 */
export const CRON_PRESETS = [
  { label: "毎日 04:00", cron: "0 4 * * *" },
  { label: "毎週月曜 04:00", cron: "0 4 * * 1" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const two = (n) => String(n).padStart(2, "0");

/** よく使う形の cron を言葉にする。ほかの形は式のまま。 */
export const cronWords = (cron) => {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(String(cron));
  if (m === null) return String(cron);
  const at = `${two(m[2])}:${two(m[1])}`;
  return m[3] === "*" ? `毎日 ${at}` : `毎週${WEEKDAYS[Number(m[3])]}曜 ${at}`;
};

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
  if (minutes < 60) return `${String(Math.max(minutes, 0))} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${String(hours)} 時間`;
  return `${String(Math.floor(hours / 24))} 日`;
};

/** 待っている物の時刻。頼みが在れば、期限と頼みの早い方。 */
const dueOf = (schedule) => {
  const next = Date.parse(schedule.nextRunAt);
  return schedule.runRequestedAt === null ? next : Math.min(next, Date.parse(schedule.runRequestedAt));
};

/** 状態の字と色。色の種類は `.state` の `ok`・`run`・`bad` と、無し（止めている）。 */
export const healthOf = (schedule, now = Date.now()) => {
  switch (schedule.health) {
    case "paused":
      return { kind: "", text: "止めています" };
    case "stuck": {
      const since = Date.parse(schedule.recentRuns[0]?.startedAt ?? new Date(now).toISOString());
      return { kind: "bad", text: `回が ${spanText(now - since)}走ったままです` };
    }
    case "overdue":
      return { kind: "bad", text: `次の回が ${spanText(now - dueOf(schedule))}遅れています` };
    case "failing":
      return { kind: "bad", text: "直近の回が失敗しました" };
    case "blocked":
      return {
        kind: "run",
        text: schedule.blockedBy === null ? "順番待ち（静かな時間の後に始まります）" : "順番待ち（走っているクロールの後に始まります）",
      };
    default:
      return { kind: "ok", text: "予定どおり" };
  }
};

/** 失敗の理由を 1 行にする。長ければ切る（全文は回の行の詳しい所に在る）。 */
const briefly = (text) => {
  const line = String(text).split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
};

/**
 * 帯の文。`readError` は最後の読み取りの失敗で、読めないことを「何も起きていない」と取り違えないために一緒に言う。
 * 何も無ければ undefined（帯を隠す）。**手で閉じない** —— 原因が直ると消える。
 */
export const bandOf = (schedules, readError, now = Date.now()) => {
  if (readError !== undefined) return `定期実行の状態を読めません（${readError}）`;
  const lines = schedules
    .filter((schedule) => BAND.has(schedule.health))
    .map((schedule) => {
      const said = `定期実行「${schedule.name}」: ${healthOf(schedule, now).text}`;
      const error = schedule.recentRuns[0]?.error;
      return schedule.health === "failing" && typeof error === "string" && error !== ""
        ? `${said}（${briefly(error)}）`
        : said;
    });
  return lines.length === 0 ? undefined : lines.join(" ／ ");
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
  if (run.state === "running") return { kind: "run", text: "走行中" };
  if (run.state === "failed") return { kind: "bad", text: "失敗" };
  if (run.pagesFailed > 0) {
    return { kind: "warn", text: `一部失敗（撮れた ${String(run.pagesCaptured)}・失敗 ${String(run.pagesFailed)}）` };
  }
  return { kind: "ok", text: `撮れた ${String(run.pagesCaptured)}` };
};

/** 回がいつの物か。本来の時刻が無いのは「いま撮る」の回。 */
export const runWhen = (run, timeZone) =>
  run.scheduledFor === null ? "いま撮る" : shortTime(run.scheduledFor, timeZone);

/** 本来の時刻からの遅れ。1 分未満は言わない。 */
export const runDelay = (run) => {
  if (run.scheduledFor === null) return "";
  const ms = Date.parse(run.startedAt) - Date.parse(run.scheduledFor);
  return ms < 60_000 ? "" : `${spanText(ms)}遅れ`;
};

/** 1 回にまとめた欠けの字。無ければ空。 */
export const runMissed = (run) => (run.scheduleMissed > 0 ? `欠け ${String(run.scheduleMissed)}` : "");

/** 撮り方の字（`autoscroll@2`）。新しい版が出ていれば後ろに添える。 */
export const scriptsText = (schedule) =>
  schedule.scripts.length === 0
    ? "走らせない"
    : schedule.scripts
        .map((script) =>
          script.latest !== null && script.latest > script.version
            ? `${script.id}@${String(script.version)}（新しい版 ${String(script.latest)}）`
            : `${script.id}@${String(script.version)}`,
        )
        .join("・");

/** 締めるボタンの相手。止まった回か、遅れの元の走行中の行。走っているだけ（`blocked`）の行は締めさせない。 */
export const closableCrawl = (schedule) =>
  (schedule.health === "stuck" || schedule.health === "overdue") && schedule.blockedBy !== null
    ? schedule.blockedBy.crawlId
    : undefined;

/** クロールの行の印。手で始めた行には付けない。 */
export const markOf = (crawl) => {
  if (crawl.schedule === null || crawl.schedule === undefined) return undefined;
  const missed = crawl.scheduleMissed > 0 ? `・欠け ${String(crawl.scheduleMissed)}` : "";
  return {
    text: `定期${missed}`,
    title:
      `定期実行「${crawl.schedule.name}」の回` +
      (crawl.scheduledFor === null ? "（いま撮る）" : `（本来の時刻 ${shortTime(crawl.scheduledFor)}）`) +
      (crawl.scheduleMissed > 0 ? `。止まっていた間の ${String(crawl.scheduleMissed)} 回をまとめた` : ""),
  };
};

/** 予定を作る本文。`request` は始める欄の本文（`startBody`）そのもの。 */
export const createBody = (name, cron, request) => ({ name: name.trim(), cron: cron.trim(), request });

/** 作った答えの 1 行。頼みの中身の断りは、始めるエンドポイントと同じ文にする（`startAnswer`）。 */
export const createAnswer = (status, answer) => {
  if (status === 201) {
    return { kind: "ok", text: `予定を作りました。次の回は ${shortTime(answer.nextRunAt, answer.timezone)} です。` };
  }
  if (status === 409) return { kind: "bad", text: "同じ名前の予定があります。別の名前にしてください。" };
  if (answer.error === "invalid cron") {
    return { kind: "bad", text: `cron の式を読めません（${String(answer.hint ?? "")}）` };
  }
  if (answer.error === "cron runs too often") {
    return {
      kind: "bad",
      text: `間隔が短すぎます（${String(answer.gapMinutes)} 分。下限は ${String(answer.minIntervalMinutes)} 分です）`,
    };
  }
  return startAnswer(status, answer);
};

const DONE = {
  pause: "止めました。",
  resume: "再開しました。",
  run: "頼みました。次の周回で始まります（走っているクロールがあれば、その後に）。",
  repin: "固定し直しました。次の回からいまの版で撮ります。",
  delete: "消しました。",
  close: "締めました。",
};

/** 操作の答えの 1 行。断られたら、capture-ledger の文をそのまま出す。 */
export const actionAnswer = (action, status, answer) => {
  if (status >= 200 && status < 300) return { kind: "ok", text: DONE[action] ?? "済みました。" };
  return startAnswer(status, answer);
};
