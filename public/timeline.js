/**
 * 取り込み 1 回の「経緯」の画面（`#trace/<クロールの id>/<ページの id>`・CAPTURE-270）。capture-ledger の
 * `GET /api/crawls/:id/pages/:page/trace` の答えと、WACZ の中の WARC のレコードの一覧（`/wacz/<archive の id>/records`）
 * を、1 本の時間軸に並べる形にするだけで、数え直しも判断もしない。DOM には触らない —— ブラウザは `/timeline.js`
 * として読み、試験は `node --test` から import する。
 *
 * ## 軸
 *
 * 軸の 0 は、ログの行の `ms` の起点（最初の行の `at − ms`。BrowserHive が取り込みの要求を受けた時刻）。ログの無い
 * 取り込みでは、取り込みの長さの起点（`timestamp − captureProcessingTimeMs`）。
 *
 * ## 時計は 2 つ
 *
 * ログの行（取り込みの段・細部・console）は BrowserHive の時計。WARC の request と response の対の `WARC-Date` は、
 * Chromium が要求を送り出した時刻（Chromium の時計）。2 つは別のコンテナの時計で、少しずれることがある。
 *
 * ## 要求の印は 2 種類
 *
 * - **始まりの印**: request と response の対。対の `WARC-Date` は要求の始まり。
 * - **記録した時刻の印**: metadata だけが在る要求（終わらなかった・失敗した・止めた・残さなかった）。この
 *   `WARC-Date` は BrowserHive がレコードを書いた時刻で、始まりではない（終わらなかった要求なら、記録を止めた時刻）。
 */
import { errorText, t } from "./i18n.js";

const TRACE_HASH = /^#trace\/([0-9a-f-]{36})\/([0-9]{1,18})$/;

/** `#trace/<クロールの id>/<ページの id>` を読む。違う形なら undefined。 */
export const parseTraceHash = (hash) => {
  const m = TRACE_HASH.exec(String(hash));
  return m === null ? undefined : { crawlId: m[1], pageId: m[2] };
};

/** `parseTraceHash` の逆。 */
export const traceHash = (crawlId, pageId) => `#trace/${crawlId}/${pageId}`;

/** 取り込み 1 回の経緯のエンドポイント（capture-ledger）。 */
export const tracePath = (crawlId, pageId) =>
  `/api/crawls/${encodeURIComponent(crawlId)}/pages/${encodeURIComponent(pageId)}/trace`;

/** WACZ の中の WARC の本の名前。BrowserHive は `data-000` から番号を進める。 */
export const warcName = (n) => `archive/data-${String(n).padStart(3, "0")}.warc.gz`;

/** daemon が 1 回に返すレコードの上限。 */
export const RECORDS_COUNT = 1000;

/** WARC のレコードの一覧のエンドポイント（workbench の `/wacz/`）。`from` は必須。 */
export const recordsPath = (archiveId, path, from) =>
  `/wacz/${encodeURIComponent(archiveId)}/records?path=${encodeURIComponent(path)}&from=${String(from)}&count=${String(RECORDS_COUNT)}`;

/** レコード 1 つ（見出しと本文の文字）のエンドポイント。 */
export const recordPath = (archiveId, path, offset, length) =>
  `/wacz/${encodeURIComponent(archiveId)}/record?path=${encodeURIComponent(path)}&offset=${String(offset)}&length=${String(length)}`;

/**
 * 秒の字（`3.10 秒`）。1 秒未満は 2 桁、10 秒未満は 2 桁、それより上は 1 桁。`unit: false` なら数だけ（`3.10`）——
 * 軸の目盛りと、要求の並びの数の列。
 */
export const secondsText = (ms, { unit = true } = {}) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const seconds = ms / 1000;
  const s = seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1);
  return unit ? t("trace.seconds", { s }) : s;
};

const epoch = (iso) => {
  const ms = Date.parse(String(iso));
  return Number.isNaN(ms) ? undefined : ms;
};

/**
 * 軸。`originMs` は軸の 0 の時刻（epoch ms）、`endMs` は軸の長さ。読めなければ undefined（取り込みの答えが無い）。
 * 終わりは、取り込みが終わった時刻（`timestamp`）と最後の行の `ms` の遅い方。
 */
export const axisOf = (answer) => {
  const lines = answer?.log?.lines ?? [];
  const capture = answer?.capture ?? null;
  const first = lines[0];
  const firstAt = first === undefined ? undefined : epoch(first.at);
  const ended = capture === null ? undefined : epoch(capture.timestamp);
  let originMs;
  if (firstAt !== undefined && typeof first.ms === "number") originMs = firstAt - first.ms;
  else if (ended !== undefined && typeof capture.captureProcessingTimeMs === "number")
    originMs = ended - capture.captureProcessingTimeMs;
  if (originMs === undefined) return undefined;
  const lastMs = lines.reduce((max, line) => (typeof line.ms === "number" ? Math.max(max, line.ms) : max), 0);
  const endMs = Math.max(lastMs, ended === undefined ? 0 : ended - originMs, 1);
  return { originMs, endMs, fromLog: firstAt !== undefined };
};

/**
 * WACZ の中のレコードを読みに行くか。WACZ の無い取り込み（時間切れ・失敗）と、軸を組めない答え（取り込みの答えが
 * 無いページ）では読まない —— 置く軸が無く、読む WACZ も無い。
 */
export const readsRecords = (answer) => typeof answer?.archive?.id === "string" && axisOf(answer) !== undefined;

/** 行の `data` の欄。切られた行では `data` が文字なので、object のときだけ読む。 */
const dataOf = (line, key) =>
  line.data !== null && typeof line.data === "object" && !Array.isArray(line.data) ? line.data[key] : undefined;

const isStepLine = (line) =>
  line.source === "browserhive" && line.level === "info" && typeof dataOf(line, "step") === "string" &&
  String(line.msg).startsWith("step ");

/**
 * 取り込みの段の帯。BrowserHive が段に入るたびに書く info の行（`data.step`）から。帯は、次の段の行まで
 * （最後の段は軸の終わりまで）。
 */
export const stepsOf = (lines, endMs) => {
  const marks = lines.filter(isStepLine);
  return marks.map((line, i) => ({
    step: String(dataOf(line, "step")),
    fromMs: line.ms,
    toMs: i + 1 < marks.length ? marks[i + 1].ms : Math.max(endMs, line.ms),
  }));
};

/**
 * 細部の帯。段の中の目印（debug の行）から。帯は、次の目印か次の段の行まで。
 */
export const detailsOf = (lines, endMs) => {
  const marks = lines.filter(
    (line) => line.source === "browserhive" && (isStepLine(line) || (line.level === "debug" && dataOf(line, "step") !== undefined)),
  );
  const out = [];
  marks.forEach((line, i) => {
    if (isStepLine(line)) return;
    out.push({
      text: String(line.msg),
      step: String(dataOf(line, "step")),
      ...(typeof line.dpr === "number" && { dpr: line.dpr }),
      fromMs: line.ms,
      toMs: i + 1 < marks.length ? marks[i + 1].ms : Math.max(endMs, line.ms),
    });
  });
  return out;
};

/**
 * スクリプトの帯。BrowserHive が書く「始めた」と「終えた」の行（`data.script` と `data.index`）を対にする。
 * 終えた行の無いスクリプト（時間切れで放棄した）は、軸の終わりまでで `open: true`。
 */
export const scriptsOf = (lines, endMs) => {
  const out = [];
  const open = new Map();
  for (const line of lines) {
    if (line.source !== "browserhive") continue;
    const script = dataOf(line, "script");
    const index = dataOf(line, "index");
    if (typeof script !== "string" || typeof index !== "number") continue;
    const key = `${String(line.dpr)} ${String(index)}`;
    if (dataOf(line, "elapsedMs") === undefined && !open.has(key)) {
      const bar = { script, fromMs: line.ms, toMs: endMs, open: true, ...(typeof line.dpr === "number" && { dpr: line.dpr }) };
      open.set(key, bar);
      out.push(bar);
    } else if (open.has(key)) {
      const bar = open.get(key);
      bar.toMs = line.ms;
      bar.open = false;
      bar.failed = line.level === "error" || line.level === "warn";
      open.delete(key);
    }
  }
  return out;
};

/** console の印。取り込みのページの行と、スクリプトが書いた行。warn と error は色を付ける。 */
export const consoleOf = (lines) =>
  lines
    .filter((line) => line.source === "page" || line.source === "script")
    .map((line) => ({ ms: line.ms, level: String(line.level), source: String(line.source), msg: String(line.msg) }));

/**
 * 待ちの印（`capture.settle`）。待ちの時刻は、待ち始めからの ms なので、待ち始めの行（細部の `settle, dpr=N` の
 * うち、同じ DPR の最後の物）の `ms` を足して軸に載せる。行が無ければ undefined（軸に置けない）。
 */
export const settleOf = (settle, lines) => {
  if (settle === null || typeof settle !== "object") return undefined;
  const starts = lines.filter(
    (line) => line.source === "browserhive" && line.level === "debug" && /^settle\b/.test(String(line.msg)) &&
      (typeof settle.devicePixelRatio !== "number" || line.dpr === settle.devicePixelRatio),
  );
  const start = starts[starts.length - 1];
  if (start === undefined || typeof settle.waitedMs !== "number") return undefined;
  const at = (ms) => (typeof ms === "number" ? start.ms + ms : undefined);
  return {
    fromMs: start.ms,
    toMs: start.ms + settle.waitedMs,
    endedBy: typeof settle.endedBy === "string" ? settle.endedBy : undefined,
    loadMs: at(settle.load?.atMs),
    networkQuietMs: at(settle.network?.quietAtMs),
    cpuQuietMs: at(settle.cpu?.quietAtMs),
    domQuietMs: at(settle.dom?.quietAtMs),
  };
};

/**
 * 取り込みが止まった段。成功した取り込みでは undefined。失敗・時間切れの答えは段の名前を運ばないので、
 * ログの最後の段の行から読む。
 */
export const stoppedStepOf = (answer) => {
  const status = answer?.capture?.status;
  if (status === undefined || status === "success") return undefined;
  const steps = (answer?.log?.lines ?? []).filter(isStepLine);
  const last = steps[steps.length - 1];
  return last === undefined ? undefined : String(dataOf(last, "step"));
};

/** metadata の本文（`application/warc-fields`。`名前: 値` の行）を欄にする。同じ名前は最初の値。 */
export const parseWarcFields = (text) => {
  const fields = {};
  for (const line of String(text).split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (!(name in fields)) fields[name] = line.slice(at + 1).trim();
  }
  return fields;
};

/**
 * metadata の欄から、何の記録かを決める。順は wacz-validator の `warc/recording-complete` と同じ。
 *
 * - `window`・`snapshot`: 要求の記録ではない（開かせなかったウィンドウ・DOM の写しの説明）
 * - `truncated`: 応答の在る交信に付く「本文を省いた」（理由は値）
 * - `denied`・`not-archived`: 方針で止めた・送ったが残さなかった
 * - `failed`: 失敗した（`loadingFailed`・応答なしで終わった）
 * - `incomplete`: 取り込みを止めた時点で終わっていなかった
 */
export const metadataKind = (fields) => {
  if (fields.window !== undefined) return "window";
  if (fields.snapshot !== undefined) return "snapshot";
  if (fields.truncated !== undefined) return "truncated";
  if (fields.action === "deny") return "denied";
  if (fields.action === "no-archive") return "not-archived";
  if (fields.reason === "loadingFailed" || fields.reason === "loadingFinished-without-response") return "failed";
  if (fields.incomplete !== undefined || fields.reason !== undefined) return "incomplete";
  return "unknown";
};

/** 印の種類 → 字を返す関数。字は、引くときの言語で決まる。 */
const KIND_TEXT = {
  incomplete: () => t("trace.kind.incomplete"),
  failed: () => t("trace.kind.failed"),
  denied: () => t("trace.kind.denied"),
  "not-archived": () => t("trace.kind.notArchived"),
  unread: () => t("trace.kind.unread"),
  unknown: () => t("trace.kind.unknown"),
};

/** 印の種類。並びは `KIND_TEXT` の並び。 */
export const KINDS = Object.keys(KIND_TEXT);

/** 印の種類の字。知らない種類は、届いた字のまま。 */
export const kindText = (kind) => (Object.hasOwn(KIND_TEXT, kind) ? KIND_TEXT[kind]() : String(kind));

/**
 * レコードの一覧（本ごと）を、軸に置く物にする。
 *
 * - `exchanges`: request と response の対（始まりの印）。BrowserHive は 1 つの交信を response・request・（本文を
 *   省いたときは）metadata の順に続けて書き、3 つは同じ URI と時刻を持つ。対の後ろの metadata は `attached` に持つ
 * - `notes`: ほかの metadata（記録した時刻の印の候補）。本文を読むまで種類は `unread`
 * - `snapshots`: DOM の写しの resource（`urn:browserhive:snapshot:<時点>:<文書の URL>`）
 *
 * `files` は `[{ path, records }]`。位置は `Date.parse(date) − originMs`。
 */
export const marksOf = (files, originMs) => {
  const exchanges = [];
  const notes = [];
  const snapshots = [];
  const at = (date) => {
    const ms = epoch(date);
    return ms === undefined ? undefined : ms - originMs;
  };
  for (const { path, records } of files) {
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const uri = record.uri ?? "";
      const same = (other, type) =>
        other !== undefined && other.type === type && other.uri === record.uri && other.date === record.date;
      if (record.type === "response") {
        const one = { uri, ms: at(record.date), status: record.status, mime: record.mime, path, offset: record.offset, length: record.length };
        if (same(records[i + 1], "request")) i += 1;
        if (same(records[i + 1], "metadata")) {
          i += 1;
          one.attached = { path, offset: records[i].offset, length: records[i].length };
        }
        exchanges.push(one);
      } else if (record.type === "resource" && uri.startsWith("urn:browserhive:snapshot:")) {
        const rest = uri.slice("urn:browserhive:snapshot:".length);
        const colon = rest.indexOf(":");
        snapshots.push({ stage: rest.slice(0, colon), documentUrl: rest.slice(colon + 1), uri, ms: at(record.date) });
      } else if (record.type === "metadata" && !uri.startsWith("urn:")) {
        notes.push({ uri, ms: at(record.date), path, offset: record.offset, length: record.length, kind: "unread" });
      }
    }
  }
  return { exchanges, notes, snapshots };
};

/** 読んだ本文を引く鍵。 */
export const bodyKey = (at) => `${at.path} ${String(at.offset)}`;

/**
 * 読んだ metadata の本文（`bodyKey` → 文字）を、印に当てる。要求でない物（開かせなかったウィンドウ）は外し、
 * 対に付いた metadata は「本文を省いた」理由にする。残りが「記録した時刻の印」。
 */
export const applyMetadata = (marks, bodies) => {
  const notes = [];
  for (const note of marks.notes) {
    const text = bodies.get(bodyKey(note));
    if (text === undefined) {
      notes.push(note);
      continue;
    }
    const fields = parseWarcFields(text);
    const kind = metadataKind(fields);
    if (kind === "window" || kind === "snapshot") continue;
    notes.push({
      ...note,
      // 対から離れて書かれた「本文を省いた」は、種類の分からない記録として残す（数えはしない）
      kind: kind === "truncated" ? "unknown" : kind,
      ...(fields.reason !== undefined && { reason: fields.reason }),
      ...(fields.errorText !== undefined && { error: fields.errorText }),
      ...(fields.resourceType !== undefined && { resourceType: fields.resourceType }),
      ...(fields.method !== undefined && { method: fields.method }),
      ...(fields.pattern !== undefined && { pattern: fields.pattern }),
    });
  }
  const exchanges = marks.exchanges.map((one) => {
    const text = one.attached === undefined ? undefined : bodies.get(bodyKey(one.attached));
    if (text === undefined) return one;
    const omitted = parseWarcFields(text).truncated;
    return omitted === undefined ? one : { ...one, bodyOmitted: omitted };
  });
  return { exchanges, notes, snapshots: marks.snapshots };
};

/** 印の数。画面の見出しと、`waczStats` との突き合わせに使う。 */
export const tallyOf = (marks) => {
  const tally = { exchanges: marks.exchanges.length, incomplete: 0, failed: 0, denied: 0, "not-archived": 0, unread: 0, unknown: 0 };
  for (const note of marks.notes) tally[note.kind] = (tally[note.kind] ?? 0) + 1;
  return tally;
};

/** daemon が「その名前の entry は無い」と答えたか。WARC の本を順に読むときの終わりの合図は、これだけ。 */
export const isNoEntry = (status, body) =>
  status === 400 && typeof body?.message === "string" && body.message.startsWith("no entry: ");

/** 本を読む数の上限。BrowserHive の本は既定で 1 GB ごとなので、ふつうは 1 本（dev の一式は 1 MiB ごとに分ける）。 */
export const WARC_FILES_MAX = 100;

/**
 * WACZ の中の WARC のレコードの一覧を、本ごとに全部読む。`fetchJson(path)` は `{ status, body }` を返す関数
 * （画面は `fetch`、試験は偽物を渡す）。
 *
 * `data-000` から順に読み、「その名前の entry は無い」で終わる。1 回は `RECORDS_COUNT` 本までで、続きは答えの
 * `next`。ほかの失敗は、読めた分と理由（`error`）を返す。
 */
export const readRecords = async (fetchJson, archiveId) => {
  const files = [];
  for (let n = 0; n < WARC_FILES_MAX; n += 1) {
    const path = warcName(n);
    const records = [];
    let from = 0;
    for (;;) {
      const { status, body } = await fetchJson(recordsPath(archiveId, path, from));
      if (isNoEntry(status, body)) return { files };
      if (status !== 200) {
        if (records.length > 0) files.push({ path, records });
        return { files, error: { status, message: errorText(body) ?? `HTTP ${String(status)}` } };
      }
      records.push(...(body.records ?? []));
      if (typeof body.next !== "number") break;
      from = body.next;
    }
    files.push({ path, records });
  }
  return {
    files,
    error: { status: 0, message: t("trace.records.tooManyFiles", { n: WARC_FILES_MAX }) },
  };
};

/** 先に本文を読む metadata の数。残りは、印を押したときに読む。 */
export const NOTES_EAGER = 40;

/** 軸の上の位置（%）。軸の外は端に寄せる。 */
export const percentOf = (ms, endMs) => {
  if (typeof ms !== "number" || !Number.isFinite(ms) || endMs <= 0) return 0;
  return Math.min(100, Math.max(0, (ms / endMs) * 100));
};

/** 軸の目盛り。4〜8 本になる、切りのよい間隔（ms）で。 */
export const ticksOf = (endMs) => {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];
  const step = steps.find((one) => endMs / one <= 8) ?? 120000;
  const out = [];
  for (let ms = 0; ms <= endMs; ms += step) out.push(ms);
  return out;
};

/** 結末の字。知らない結末は、そのまま見せる。 */
export const statusText = (status) => {
  if (status === "success") return t("trace.status.success");
  if (status === "timeout") return t("trace.status.timeout");
  if (status === "failed") return t("trace.status.failed");
  if (status === "http_error") return t("trace.status.httpError");
  return String(status);
};

/** 読めない理由の字（capture-ledger の `reason`）。 */
export const traceReasonText = (reason) => {
  if (reason === "not-captured") return t("trace.reason.notCaptured");
  if (reason === "no-manifest") return t("trace.reason.noManifest");
  if (reason === "manifest-missing") return t("trace.reason.manifestMissing");
  if (reason === "manifest-invalid") return t("trace.reason.manifestInvalid");
  return t("trace.reason.unknown");
};
