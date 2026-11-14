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
 * ## 要求の読み方は 2 つ
 *
 * **答えが `trace` を持つ取り込み（BrowserHive v30.0.0 から）** は、`trace.lines`（1 行 = 1 つの交信）から読む。行は
 * 始まり（`ms`。ログと同じ軸）と長さ（`durationMs`）を持つので、要求は棒になる。WACZ のレコードは読みに行かない。
 *
 * **`trace` が null の取り込み（それより前）** は、WACZ の中の WARC のレコードから読む。印は 2 種類:
 *
 * - **始まりの印**: request と response の対。対の `WARC-Date` は要求の始まり。
 * - **記録した時刻の印**: BrowserHive WARC の metadata だけが在る要求（終わらなかった・失敗した・止めた・残さなかった）。この
 *   `WARC-Date` は BrowserHive がレコードを書いた時刻で、始まりではない（終わらなかった要求なら、記録を止めた時刻）。
 *
 * ## 絵は 2 種類
 *
 * **節目のスクリーンショット（BrowserHive v30.2.0 から）** は、答えの `capture.screenshots` が時点ごとに述べる。
 * 絵そのものは BrowserHive WACZ の中の WARC の resource レコードで、位置は索引（CDXJ）を項目の `url` と `date` で引く。
 * **引きに行くのは、絵の項目が在る取り込みだけ** —— 欄が無い答え・全部が「残さなかった」の答えでは、WACZ を読まない。
 *
 * **失敗の時点の絵** は WACZ の外のファイルで、答えは在るかどうか（`capture.failureScreenshot`）だけを言う。
 * 中身は capture-ledger の別のエンドポイントから受け、WebP と確かめた物だけを `data:` の URL にする。
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

/**
 * WACZ の中の WARC の本の名前（古い名前の `data-NNN.warc.gz`）。BrowserHive は `data-000` から番号を進める。
 * この道は BrowserHive v30.0.0 より前の、古い名前の WACZ だけ（`readsRecords`）。新しい WACZ には trace が必ず在る ——
 * BrowserHive v31.0.0 からの名前（`data-NNN.browserhive.warc.gz`）の WACZ は、ここを通らない。
 */
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

/**
 * 長さの字。1 秒未満は ms（`23 ms`）、それより上は秒（`1.55 秒`）。要求の長さは ms の桁が多く、秒では `0.00` が並ぶ。
 */
export const lengthText = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  return ms < 1000 ? t("trace.timing.ms", { n: String(Math.round(ms)) }) : secondsText(ms);
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

/** 答えが `trace`（要求の出来事の行。BrowserHive v30.0.0 から）を持つか。 */
export const hasTrace = (answer) => Array.isArray(answer?.trace?.lines);

/**
 * WACZ の中のレコードを読みに行くか。WACZ の無い取り込み（時間切れ・失敗）と、軸を組めない答え（取り込みの答えが
 * 無いページ）では読まない —— 置く軸が無く、読む WACZ も無い。`trace` を持つ答えでも読まない —— 要求は行から読み、
 * 写しの位置はログの行から読むので、レコードの一覧と metadata の本文は要らない。
 */
export const readsRecords = (answer) =>
  typeof answer?.archive?.id === "string" && axisOf(answer) !== undefined && !hasTrace(answer);

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

/** 軸の終わりから、この割合より近い目盛りは置かない。 */
export const TICK_END_MARGIN = 0.025;

/**
 * 軸の目盛り。4〜8 本になる、切りのよい間隔（ms）で。軸の終わりに近すぎる目盛りは置かない —— 目盛りの字は線の
 * 右に出るので、終わりの間際の字は軸の外へはみ出す（全体が 3.04 秒の取り込みの「3.00」）。
 */
export const ticksOf = (endMs) => {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];
  const step = steps.find((one) => endMs / one <= 8) ?? 120000;
  const out = [];
  for (let ms = 0; ms <= endMs * (1 - TICK_END_MARGIN); ms += step) out.push(ms);
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

// ── trace の行から読む（BrowserHive v30.0.0 から）─────────────────────────

/**
 * 行の種類。結末（`outcome`）に、終わりを観測できない `pending` を別の種類として足した物。
 *
 * `unobservable` は、終わらなかったのではなく、終わりを見られなかった要求（別サイトのフレームの文書・dedicated
 * worker の script。行の `endUnobservable`）。「終わらなかった」に数えない。
 */
export const REQUEST_KINDS = ["finished", "redirected", "failed", "pending", "unobservable", "not-archived", "denied", "evicted"];

/** 行の種類。知らない結末は、届いた字のまま。 */
export const requestKindOf = (line) =>
  line.outcome === "pending" && line.endUnobservable === true ? "unobservable" : String(line.outcome);

const REQUEST_KIND_TEXT = {
  finished: () => t("trace.outcome.finished"),
  redirected: () => t("trace.outcome.redirected"),
  failed: () => t("trace.outcome.failed"),
  pending: () => t("trace.outcome.pending"),
  unobservable: () => t("trace.outcome.unobservable"),
  "not-archived": () => t("trace.outcome.notArchived"),
  denied: () => t("trace.outcome.denied"),
  evicted: () => t("trace.outcome.evicted"),
};

/** 行の種類の字。知らない種類は、届いた字のまま。 */
export const requestKindText = (kind) =>
  Object.hasOwn(REQUEST_KIND_TEXT, kind) ? REQUEST_KIND_TEXT[kind]() : String(kind);

/**
 * `trace.lines` を、軸に置く物にする。並びは行の並びのまま（`index` は行の番号）。
 *
 * 位置は行の `ms`（ログの行と同じ軸。BrowserHive が Chromium の時計から合わせた値）で、`startedAt`（Chromium の
 * 壁時計）からは出さない —— 2 つの時計はずれるので、壁時計から引くと取り込みの段の帯とずれる。
 *
 * 形（`shape`）は 3 つ:
 * - `bar`: 長さ（`durationMs`）を持つ行。始まりから終わりまで
 * - `open`: 終わらなかった行（`pending`）。始まりから軸の終わりまで。終わりは無い
 * - `mark`: 始まりの印だけ。長さを持たない行 —— 方針に当たった行（残さなかった・止めた）・追うのをやめた行・
 *   終わりを観測できない行。終わりを知らないので、長さを描かない
 */
export const requestsOf = (trace, endMs) =>
  (trace?.lines ?? []).map((line, index) => {
    const kind = requestKindOf(line);
    const fromMs = typeof line.ms === "number" ? line.ms : 0;
    const timed = typeof line.durationMs === "number";
    const shape = timed ? "bar" : kind === "pending" ? "open" : "mark";
    return {
      index,
      kind,
      shape,
      fromMs,
      toMs: timed ? fromMs + line.durationMs : shape === "open" ? Math.max(endMs, fromMs) : fromMs,
      line,
    };
  });

/**
 * 結末ごとの数。出どころは `trace.counts`（上限で捨てた行も数えてある）。終わりを観測できない行は、`pending` から
 * 引いて別に数える（捨てた行の中の分は分からないので、残っている行だけ）。
 */
export const requestCountsOf = (trace) => {
  const counts = trace?.counts ?? {};
  const n = (key) => (typeof counts[key] === "number" ? counts[key] : 0);
  const unobservable = (trace?.lines ?? []).filter((line) => requestKindOf(line) === "unobservable").length;
  const out = {
    finished: n("finished"),
    redirected: n("redirected"),
    failed: n("failed"),
    pending: Math.max(0, n("pending") - unobservable),
    unobservable,
    "not-archived": n("notArchived"),
    denied: n("denied"),
    evicted: n("evicted"),
  };
  return {
    ...out,
    total: Object.values(out).reduce((sum, one) => sum + one, 0),
    dropped: typeof trace?.dropped === "number" ? trace.dropped : 0,
  };
};

/** 並べ方。`start` は始まりの順、`longest` は長い順（長さを持たない行は後ろ）。 */
export const REQUEST_SORTS = ["start", "longest"];

export const sortRequests = (requests, by) => {
  const byStart = (a, b) => a.fromMs - b.fromMs || a.index - b.index;
  if (by !== "longest") return [...requests].sort(byStart);
  const length = (one) => (one.shape === "bar" ? one.toMs - one.fromMs : -1);
  return [...requests].sort((a, b) => length(b) - length(a) || byStart(a, b));
};

/** 失敗した行と、終わらなかった行か。終わりを観測できない行は入れない。 */
export const isTroubledRequest = (one) => one.kind === "failed" || one.kind === "pending";

/** 絞り込み。`trouble` は、失敗と終わらなかった物だけ。 */
export const filterRequests = (requests, only) => (only === "trouble" ? requests.filter(isTroubledRequest) : requests);

/** 内訳の欄。並びは、時間の流れの順。 */
export const TIMING_PARTS = ["dnsMs", "connectMs", "tlsMs", "sendMs", "waitMs", "receiveMs"];

/**
 * 行の長さの内訳。`timing` の 6 つと、長さから 6 つの和を引いた残り（`otherMs`）。残りは、Chromium が要求を送り出す
 * 前の待ちと、BrowserHive が要求と応答を止めていた時間（方針の照らし・本文の読み取り）。`timing` か長さの無い行は
 * undefined。
 */
export const timingOf = (line) => {
  const timing = line?.timing;
  if (timing === null || typeof timing !== "object" || typeof line.durationMs !== "number") return undefined;
  const parts = TIMING_PARTS.map((key) => ({ key, ms: typeof timing[key] === "number" ? timing[key] : 0 }));
  const sum = parts.reduce((total, part) => total + part.ms, 0);
  return { parts, sumMs: sum, otherMs: Math.max(0, line.durationMs - sum) };
};

/**
 * DOM の写しの印を、ログの行から置く。BrowserHive は写しを取るたびに細部の行（`snapshot <時点>`）を書く。
 * リンクの URN（`urn:browserhive:snapshot:<時点>:<文書の URL>`）の文書の URL は、取り込みの答えの
 * `document.url`（リダイレクトの後の URL）で、ページの行の URL ではない。文書の URL の無い答え（方針で伏せた
 * 文書）では、印だけで URN は無い。
 */
export const snapshotsFromLog = (lines, capture) => {
  const documentUrl = typeof capture?.document?.url === "string" ? capture.document.url : undefined;
  const out = [];
  for (const line of lines ?? []) {
    if (line.source !== "browserhive" || line.level !== "debug") continue;
    const m = /^snapshot ([a-z][a-z-]*)/.exec(String(line.msg));
    if (m === null) continue;
    out.push({
      stage: m[1],
      ms: line.ms,
      ...(typeof line.dpr === "number" && { dpr: line.dpr }),
      ...(documentUrl !== undefined && { documentUrl, uri: `urn:browserhive:snapshot:${m[1]}:${documentUrl}` }),
    });
  }
  return out;
};

// ── 節目のスクリーンショットと、失敗の時点の絵（BrowserHive v30.2.0 から）────────────

/** 絵を撮る時点。並びは取り込みの順（読み込みの後 → スクリプトの後）。 */
export const SCREENSHOT_STAGES = ["after-load", "after-behaviors"];

const SCREENSHOT_URN = "urn:browserhive:screenshot:";

/** 絵の形式。BrowserHive が残す絵は WebP だけで、画面はほかの形式を `<img>` に渡さない。 */
export const SCREENSHOT_MIME = "image/webp";

/**
 * 答えの `capture.screenshots`（BrowserHive が書いたまま。時点ごとの成り行き）を、時点の順に並べた物。
 *
 * **欄の無い答え（BrowserHive v30.1.0 以前）は undefined** —— 「絵を残さなかった」と「欄が無い」は別で、欄が無ければ
 * 画面は何も足さない。並びは `SCREENSHOT_STAGES` の順（知らない時点は後ろ。同じ時点は届いた順）。
 *
 * - 絵の在る項目: `{ stage, kept: true, url, date, bytes, record, documentUrl, snapshotUri, ms }`。`url` は絵のレコードの
 *   URI（`urn:browserhive:screenshot:<時点>:<文書の URL>`）、`date` は撮り始めた時刻（レコードの `WARC-Date`）。
 *   `documentUrl` はその URI の文書の URL、`snapshotUri` は同じ時点の DOM の写しの URI、`ms` は軸の上の位置
 *   （`date` − 軸の 0。軸を組めなければ無い）
 * - 無い項目: `{ stage, kept: false, skipped }`。`skipped` は残さなかった理由（`SCREENSHOT_SKIPS`）
 */
export const screenshotsOf = (answer) => {
  const items = answer?.capture?.screenshots;
  if (!Array.isArray(items)) return undefined;
  const originMs = axisOf(answer)?.originMs;
  const rank = (stage) => {
    const at = SCREENSHOT_STAGES.indexOf(stage);
    return at < 0 ? SCREENSHOT_STAGES.length : at;
  };
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item !== null && typeof item === "object" && typeof item.stage === "string")
    .sort((a, b) => rank(a.item.stage) - rank(b.item.stage) || a.index - b.index)
    .map(({ item }) => {
      const { stage } = item;
      if (typeof item.url !== "string" || typeof item.date !== "string") {
        return { stage, kept: false, skipped: typeof item.skipped === "string" ? item.skipped : "" };
      }
      const prefix = `${SCREENSHOT_URN}${stage}:`;
      const documentUrl = item.url.startsWith(prefix) ? item.url.slice(prefix.length) : undefined;
      const at = epoch(item.date);
      return {
        stage,
        kept: true,
        url: item.url,
        date: item.date,
        ...(typeof item.bytes === "number" && { bytes: item.bytes }),
        ...(typeof item.record === "string" && { record: item.record }),
        ...(documentUrl !== undefined && { documentUrl, snapshotUri: `urn:browserhive:snapshot:${stage}:${documentUrl}` }),
        ...(at !== undefined && originMs !== undefined && { ms: at - originMs }),
      };
    });
};

/**
 * 絵のレコードの位置を、WACZ へ引きに行くか。**絵の項目が 1 つも無い取り込み（欄が無い・全部 `skipped`）では
 * 行かない** —— 理由を言うのに WACZ は要らない。WACZ の無い取り込みと、見てよくない WACZ（capture-ledger が鍵
 * `objectKey` を返さない）でも行かない —— 行っても、capture-ledger が 404 で断る。
 */
export const readsScreenshots = (answer) =>
  typeof answer?.archive?.id === "string" &&
  typeof answer.archive.objectKey === "string" &&
  (screenshotsOf(answer) ?? []).some((shot) => shot.kept);

const SCREENSHOT_SKIP_TEXT = {
  disabled: () => t("trace.shots.skipped.disabled"),
  secret: () => t("trace.shots.skipped.secret"),
  withheld: () => t("trace.shots.skipped.withheld"),
  "task-budget": () => t("trace.shots.skipped.taskBudget"),
  failed: () => t("trace.shots.skipped.failed"),
};

/** 絵を残さなかった理由（`skipped`）。並びは、BrowserHive が 2 つ以上当たるときに先に書く順。 */
export const SCREENSHOT_SKIPS = Object.keys(SCREENSHOT_SKIP_TEXT);

/** 残さなかった理由の字。知らない理由は届いた字のまま、理由の無い項目は「書かれていない」。 */
export const screenshotSkipText = (skipped) => {
  if (Object.hasOwn(SCREENSHOT_SKIP_TEXT, skipped)) return SCREENSHOT_SKIP_TEXT[skipped]();
  return skipped === "" || skipped === undefined ? t("trace.shots.skipped.unsaid") : String(skipped);
};

/**
 * 絵の無い時点を、言う行にまとめる。**理由が全部同じで、絵が 1 枚も無ければ 1 行**（`stage` は無い）。理由が時点ごとに
 * 違うか、絵の在る時点と混ざるときは、時点ごとに 1 行。絵の無い時点が無ければ空。
 */
export const screenshotSkipLines = (shots) => {
  const skipped = (shots ?? []).filter((shot) => !shot.kept);
  if (skipped.length === 0) return [];
  const same = skipped.every((shot) => shot.skipped === skipped[0].skipped);
  if (same && skipped.length === shots.length) return [{ skipped: skipped[0].skipped }];
  return skipped.map((shot) => ({ stage: shot.stage, skipped: shot.skipped }));
};

/**
 * 答えの `capture.random`（BrowserHive の要約を capture-ledger v0.105.0 が通した物。BrowserHive WACZ Profile 1.26.0 の
 * `browserhive:capture.random`）。ページの JS が `Math.random`・`crypto` から受け取った値を `random/values.jsonl` に控えたか。
 *
 * **欄の無い答え（それより前の取り込み）と、読めない形は undefined** —— 画面は何も足さない。
 *
 * - 控えた: `{ recorded: true, draws, truncated }`。`draws` は値の行の数、`truncated` は行が欠けているかもしれないか
 * - 控えなかった: `{ recorded: false, skipped }`。`skipped` は理由（`not-requested`・`withheld`・`failed`。無ければ空の字）
 */
export const randomOf = (capture) => {
  const random = capture?.random;
  if (random === null || typeof random !== "object") return undefined;
  if (random.recorded === true && typeof random.draws === "number") {
    return { recorded: true, draws: random.draws, truncated: random.truncated === true };
  }
  if (random.recorded === false) return { recorded: false, skipped: typeof random.skipped === "string" ? random.skipped : "" };
  return undefined;
};

const RANDOM_SKIP_TEXT = {
  withheld: () => t("trace.random.withheld"),
  failed: () => t("trace.random.failed"),
};

/**
 * 経緯の画面の頭の 1 項目（`randomOf` の物から）。控えた取り込みは値の行の数と、欠けているかもしれないときの印。
 * 控えなかった取り込みは、文書を伏せたか、控えられなかったかを言う。**頼まなかった取り込み（`not-requested`）と、欄の無い
 * 取り込みは undefined**（何も足さない）。知らない理由は届いた字のまま。
 */
export const randomText = (random) => {
  if (random === undefined) return undefined;
  if (random.recorded) {
    return random.truncated ? t("trace.random.drawsTruncated", { n: random.draws }) : t("trace.random.draws", { n: random.draws });
  }
  if (random.skipped === "not-requested") return undefined;
  if (Object.hasOwn(RANDOM_SKIP_TEXT, random.skipped)) return RANDOM_SKIP_TEXT[random.skipped]();
  return t("trace.random.other", { why: random.skipped === "" ? t("trace.shots.skipped.unsaid") : random.skipped });
};

/** WACZ の索引（CDXJ）の名前。BrowserHive は、圧縮しない 1 本をここに書く。 */
export const INDEX_PATH = "indexes/index.cdxj";

/** 索引を 1 回に読む行の数（daemon の行の窓の上限）。 */
export const INDEX_COUNT = 500;

/** 索引を読む窓の数の上限。超えたら、見つかった分と理由を返す。 */
export const INDEX_WINDOWS_MAX = 20;

/** 索引の行の窓のエンドポイント（workbench の `/wacz/`）。 */
export const indexLinesPath = (archiveId, from) =>
  `/wacz/${encodeURIComponent(archiveId)}/lines?path=${encodeURIComponent(INDEX_PATH)}&from=${String(from)}&count=${String(INDEX_COUNT)}`;

/** 索引の 1 行を丸ごと読むエンドポイント。窓が切った長い行（1 行 2 KiB まで）のため。 */
export const indexLinePath = (archiveId, n) =>
  `/wacz/${encodeURIComponent(archiveId)}/line?path=${encodeURIComponent(INDEX_PATH)}&n=${String(n)}`;

/** CDXJ の時刻（14 桁。秒まで）。読めない時刻は undefined。 */
export const cdxjTimestamp = (date) => {
  const ms = epoch(date);
  return ms === undefined ? undefined : new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);
};

/**
 * 絵の項目を引く、索引の行の頭（`<鍵> <時刻> `）。BrowserHive は絵の行の鍵を、絵の URI のまま書く（SURT にしない）
 * ので、項目の `url` と `date` がそのまま鍵と時刻になる（BrowserHive WACZ Profile の #archive-files）。
 */
export const screenshotIndexKey = (shot) => `${shot.url} ${String(cdxjTimestamp(shot.date))} `;

/**
 * 索引の 1 行（`<鍵> <時刻> <JSON>`）から、絵のレコードの位置を読む。`filename` は `archive/` からの相対（WACZ の
 * 慣習）。**`mime` が WebP でない行・位置が揃わない行は undefined** —— 絵でない物を `<img>` に渡さない。
 */
export const screenshotPlaceOf = (line, shot) => {
  const head = screenshotIndexKey(shot);
  if (typeof line !== "string" || !line.startsWith(head)) return undefined;
  let fields;
  try {
    fields = JSON.parse(line.slice(head.length));
  } catch {
    return undefined;
  }
  if (fields === null || typeof fields !== "object" || fields.mime !== SCREENSHOT_MIME) return undefined;
  const offset = Number(fields.offset);
  const length = Number(fields.length);
  const { filename } = fields;
  if (typeof filename !== "string" || filename === "" || filename.includes("/")) return undefined;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(length) || length <= 0) return undefined;
  return { path: `archive/${filename}`, offset, length };
};

/**
 * 絵のレコードの位置を、WACZ の索引から引く。`fetchJson(path)` は `{ status, body }` を返す関数（画面は `fetch`、
 * 試験は偽物を渡す）。答えは `{ places, error? }` で、`places` は絵の URI → `{ path, offset, length }`。
 *
 * **往復は、ふつう 1 回**（索引の行の窓を 1 つ）。絵の項目が無ければ 0 回。増えるのは 2 つの場合だけ:
 * 索引が `INDEX_COUNT` 行より長く、まだ見つかっていない絵が在る（次の窓）／絵の行が窓の 1 行の上限より長い
 * （その行だけ丸ごと読む。文書の URL が長いとき）。全部見つかったら、そこで止める。
 */
export const locateScreenshots = async (fetchJson, archiveId, shots) => {
  const wanted = (shots ?? []).filter((shot) => shot.kept);
  const places = new Map();
  if (wanted.length === 0) return { places };
  const missing = () => wanted.filter((shot) => !places.has(shot.url));
  const take = (text) => {
    for (const shot of missing()) {
      const place = screenshotPlaceOf(text, shot);
      if (place !== undefined) places.set(shot.url, place);
    }
  };
  let from = 0;
  for (let n = 0; n < INDEX_WINDOWS_MAX; n += 1) {
    const { status, body } = await fetchJson(indexLinesPath(archiveId, from));
    if (status !== 200) return { places, error: { status, message: errorText(body) ?? `HTTP ${String(status)}` } };
    for (const line of body.lines ?? []) {
      if (line.binary === true || typeof line.text !== "string") continue;
      if (line.cut !== true) {
        take(line.text);
        continue;
      }
      // 切られた行は JSON が閉じていない。頭が欲しい絵の鍵に合う（か、鍵の途中で切れている）行だけ、丸ごと読む
      const maybe = missing().some((shot) => {
        const head = screenshotIndexKey(shot);
        return line.text.startsWith(head) || head.startsWith(line.text);
      });
      if (!maybe) continue;
      const whole = await fetchJson(indexLinePath(archiveId, line.n));
      if (whole.status === 200 && typeof whole.body?.text === "string" && whole.body.cut !== true) take(whole.body.text);
    }
    if (missing().length === 0 || typeof body.next !== "number") return { places };
    from = body.next;
  }
  return {
    places,
    error: { status: 0, message: t("trace.shots.indexTooLong", { n: INDEX_WINDOWS_MAX * INDEX_COUNT }) },
  };
};

/**
 * 絵の `<img>` に渡す URL。**同じオリジンの `/wacz/…/record/body` だけ** —— 取り込みのページの中身なので、daemon が
 * raster の画像と確かめ、`nosniff` と `sandbox` を付けて返す道を通す。
 */
export const screenshotSrc = (archiveId, place) =>
  `/wacz/${encodeURIComponent(archiveId)}/record/body?path=${encodeURIComponent(place.path)}&offset=${String(place.offset)}&length=${String(place.length)}`;

/** 答えが、失敗の時点の絵が在ると言うか（`capture.failureScreenshot`。場所は返らない）。 */
export const hasFailureScreenshot = (answer) => answer?.capture?.failureScreenshot === true;

/** 失敗の時点の絵のエンドポイント（capture-ledger）。 */
export const failureScreenshotPath = (crawlId, pageId) => `${tracePath(crawlId, pageId)}/failure-screenshot`;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * 失敗の時点の絵のエンドポイントの答え（`{ contentType, base64 }`）を、`<img>` に渡す `data:` の URL にする。
 * **`contentType` が WebP でない答え・base64 でない字は undefined**（出さない）—— 絵は取り込みのページの中身で、
 * 形式を確かめずに `data:` に組むと、絵でない物（SVG・HTML）を画面のオリジンで開くことになる。
 */
export const failureScreenshotSrc = (body) => {
  if (body === null || typeof body !== "object" || body.contentType !== SCREENSHOT_MIME) return undefined;
  if (typeof body.base64 !== "string" || !BASE64.test(body.base64)) return undefined;
  return `data:${SCREENSHOT_MIME};base64,${body.base64}`;
};

/** base64 の字から、元のバイト数。 */
export const base64Bytes = (base64) => {
  const text = String(base64);
  const pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - pad);
};

/**
 * 失敗の時点の絵のエンドポイントの答えを、画面が出す物にする。出せれば `{ src, bytes }`、出せなければ `{ error }`
 * （言う文）。404 は「絵が無い」、`contentType` が WebP でない答えと base64 でない字は「出さない」。
 */
export const failureScreenshotOf = (status, body) => {
  if (status === 404) return { error: t("trace.failureShot.missing") };
  if (status !== 200) {
    return { error: t("trace.failureShot.unreadable", { said: errorText(body) ?? `HTTP ${String(status)}` }) };
  }
  const src = failureScreenshotSrc(body);
  if (src !== undefined) return { src, bytes: base64Bytes(body.base64) };
  return body?.contentType === SCREENSHOT_MIME
    ? { error: t("trace.failureShot.invalid") }
    : { error: t("trace.failureShot.notWebp", { type: String(body?.contentType).slice(0, 80) }) };
};
