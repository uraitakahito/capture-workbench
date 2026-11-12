/**
 * capture-ledger の代役。workbench のサンドボックス (docker-compose.yml の sandbox-ledger) の中で動く。
 *
 * workbench が capture-ledger に訊くエンドポイントと、IdP (手元は capture-ledger の Floci) のサインインに、台本 (scenario.json) と
 * WACZ の置き場から答える。応答の欄は capture-ledger の応答に合わせてある (出どころは
 * 各関数の注記)。認可は真似ない —— 名乗りは何でも通す。サインインは画面を出さずにすぐ戻す
 * (`/sandbox-pool/authorize`)。トークンは署名の無い見本で、名乗りの欄 (`username`・`cognito:groups`) だけを持つ。
 *
 * 署名付き URL の代わりに、置き場の `file://` の URL を返す。検証の daemon
 * (sandbox-validator) も同じ置き場を同じ path に mount しているので、それを読める。
 *
 * `POST /api/crawls` (workbench の新しいクロールの画面) にも答える。受けた行は代役が起きている間だけ在り、
 * 台本の `submit.runsSeconds` 秒走ってから完走になる (台本の行とは別に持つ)。走らせるもの
 * (`scripts`。登録済みのスクリプトの名指しとその場の TS) も capture-ledger と同じ形で受け、1 本の詳しい所に返す。
 *
 * 登録済みのスクリプト (台本の `catalog`) は版の並びで、source は sandbox/catalog の写しから読む。スクリプトを読むエンドポイント
 * (版の一覧・1 版・受け皿の型) にも答える。対象サイト (`sites`) のある版はサイト用のスクリプトで、capture-ledger と同じく
 * 起点のホストで選び、合わない名指しは 400 で断る。
 *
 * クロールごとの値 (capture-ledger v0.67.0) も受ける。版の `params` (宣言) を一覧と 1 版のエンドポイントに出し、頼みの `variables` を
 * 宣言に照らして capture-ledger と同じ文で 400 を言う。宣言したシークレットは、台本の `windmillSecrets` (在る secret 変数の名前)
 * と `windmillVariables` (在るが secret でない変数の名前) を Windmill の代わりにして確かめ、受けた行に名前と path を持つ
 * (値はどこにも無い —— capture-ledger と同じ)。シークレットの宣言の `archive` (値を WARC に残すなら `"keep"`。capture-ledger v0.90.0) も
 * capture-ledger と同じく読み、行に写す。隠すシークレットを送るのに配備の形式 (台本の `captureFormats`) が値を置き換えられない物を
 * 頼むなら、capture-ledger と同じ文で 400。
 *
 * ページのエンドポイント (CAPTURE-18 で capture-ledger が足す `GET /api/crawls/:id/pages` と `…/pages/:page/log`) にも、台本の行の `pages` から
 * 答える。ログは台本のページの `log` (BrowserHive の答えの log の形) で、無ければ読めない理由を返す。
 *
 * 型で落ちた行の、型の誤りの取り直し (`GET /api/crawls/:id/diagnostics`) と直し方 (`POST …/inline/:name/fix`。
 * CAPTURE-49) にも、台本の行の `diagnosed` と `fixes` から答える。**代役は Claude を呼ばない。**
 *
 * 検索のエンドポイント (`GET /api/search`。CAPTURE-53) にも、台本の `searchPages` から答える。**代役は OpenSearch を持たない** ——
 * 語を含む行を拾うだけで、点数も分かち書きも無い。
 *
 * クロールの合本 (CAPTURE-54。capture-ledger が段ごとに保管庫へ書く replay.json と pages.json) の欄も返す —— 行と詳しい所の
 * `replayBundle` (台本の行の `replayBundle` から。鍵は capture-ledger と同じ形に組む) と、ページの行の `capturedAt`・`bundledRev`
 * (台本のページから)。**代役は合本を書かない** —— 保管庫も replay も無いので、replay ↗ の先には何も無い。
 *
 * 試験から関数を import できるように、server は直に走らせたときだけ立てる。
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** WACZ の置き場。compose の中では /samples (daemon も同じ path で読む)。 */
const SAMPLES = process.env.SANDBOX_SAMPLES ?? "/samples";
const SCENARIO = new URL("./scenario.json", import.meta.url);

/** 台本が `file` で名指すファイル (sandbox/ からの相対)。 */
const readBeside = (file) => readFileSync(new URL(`./${file}`, SCENARIO), "utf8");
const sha256Of = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * 台本の時刻の基準。代役が起きた時刻に固定する —— 要求のたびの「いま」を基準にすると、
 * 走行中の行はいつ引いても startedSecondsAgo 秒前に始まったことになり、かかった時間が伸びない。
 */
const STARTED = Date.now();

/** capture-ledger と同じ UUID の形の id を、名前から決める (何度起こしても同じ id になる)。 */
export const idOf = (name) =>
  createHash("sha1")
    .update(name)
    .digest("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5");

/**
 * 行の合本の欄 (`replayBundle`)。形は CAPTURE-56 で capture-ledger が足す src/api/crawls.ts の replayBundleOf と同じ ——
 * 書けた版も、書けなかった記録も無ければ null。台本の行の `replayBundle` は `{ rev, pages, builtSecondsAgo, error }` で
 * （`builtAt` は `scenarioAt` が組む）、鍵は capture-ledger と同じ置き場 (`org/<orgId>/crawls/<crawlId>/r<rev>/replay.json`) に組む。`rev` を省いた行は失敗だけの行
 * (鍵・版・ページの数・時刻が null)。受けた行 (`submittedRow`) は null を持つ。
 */
export const replayBundleOf = (c) => {
  const said = c.replayBundle ?? null;
  const rev = said?.rev ?? null;
  const error = said?.error ?? null;
  if (rev === null && error === null) return null;
  return {
    key: rev === null ? null : `org/${c.orgId ?? "acme"}/crawls/${c.crawlId}/r${String(rev)}/replay.json`,
    rev,
    pages: rev === null ? null : said.pages,
    builtAt: rev === null ? null : said.builtAt,
    error,
  };
};

/**
 * 台本の行に、時刻を入れる。台本の時刻は「何秒前」で、now (代役が起きた時刻) を基準に組む。走行中は終わりが無い。一覧の行と
 * 詳しい所が同じ時刻を返すように、どちらもこれを通す。workbench は `builtAt` と `finishedAt` を比べて途中の版を見分ける
 * ので、片方だけを固定の日付にできない。
 */
export const scenarioAt = (c, now) => ({
  ...c,
  finishedAt:
    c.state === "running"
      ? null
      : new Date(now - (c.startedSecondsAgo - c.tookSeconds) * 1000).toISOString(),
  ...(typeof c.replayBundle?.builtSecondsAgo === "number" && {
    replayBundle: {
      ...c.replayBundle,
      builtAt: new Date(now - c.replayBundle.builtSecondsAgo * 1000).toISOString(),
    },
  }),
});

/**
 * /api/crawls の 1 行。欄は capture-ledger の src/api/crawls.ts (v0.57.4) と同じ。合本の欄 (`replayBundle`) は
 * CAPTURE-56 の形から、`pagesFailed` は v0.77.0 から (capture-ledger と同じく、ページの行の failed を数える)。
 * 時刻は台本の「何秒前」から、now (代役が起きた時刻) を基準に組む。走行中は終わりが無い。
 */
export const crawlRow = (c, now) => ({
  crawlId: c.crawlId,
  state: c.state,
  stopReason: c.stopReason ?? null,
  seeds: c.seeds,
  requestedBy: c.requestedBy ?? "sandbox",
  orgId: c.orgId ?? "acme",
  startedAt: new Date(now - c.startedSecondsAgo * 1000).toISOString(),
  finishedAt: scenarioAt(c, now).finishedAt,
  maxDepth: c.maxDepth ?? 2,
  pagesDiscovered: c.pagesDiscovered ?? 0,
  pagesCaptured: c.pagesCaptured ?? 0,
  pagesFailed: (c.pages ?? []).filter((page) => page.state === "failed").length,
  error: c.error ?? null,
  waczCount: c.waczCount ?? 0,
  lastJob: c.lastJobId === undefined ? null : { id: c.lastJobId, depth: c.lastJobDepth ?? 0 },
  // 一番新しい段を Windmill に投げた様子 (capture-ledger CAPTURE-180)。台本に無い行は null (段の行を入れる前の形)
  dispatch: c.dispatch ?? null,
  replayBundle: replayBundleOf(scenarioAt(c, now)),
  // 定期の回の欄 (capture-ledger CAPTURE-173)。手で始めた行は null と 0
  schedule: c.schedule ?? null,
  scheduledFor: c.scheduledSecondsAgo === undefined ? null : new Date(now - c.scheduledSecondsAgo * 1000).toISOString(),
  scheduleMissed: c.scheduleMissed ?? 0,
});

/**
 * /api/crawls/:id の、走らせたもの 1 本。欄は capture-ledger v0.61.0 の src/api/crawls.ts と同じ ——
 * 登録済みのスクリプトは身元と対象サイトだけ、その場の物にだけ `inline` が付く。**source は載せない**（名前・phase・バイト数）。
 */
const detailScript = (s) => ({
  id: s.id,
  version: s.version,
  phase: s.phase,
  sha256: s.sha256,
  // 対象サイト。その場の TS と、対象サイトの無い物は空
  sites: s.sites ?? [],
  jsSha256: s.jsSha256 ?? null,
  compiledWith: s.compiledWith ?? null,
  ...(s.inline !== undefined && {
    inline: {
      name: s.inline.name,
      phase: s.inline.phase,
      bytes: Buffer.byteLength(s.inline.source, "utf8"),
    },
  }),
});

/**
 * /api/crawls/:id/inline/:name。欄は capture-ledger v0.59.0 の src/api/crawls.ts と同じ ——
 * その場の TS 1 本の source を返す（workbench の「欄に戻す」が使う）。登録済みのスクリプトと、知らない名前は 404。
 */
export const inlineSource = (scripts, name) => {
  const script = (scripts ?? []).find((x) => x.inline?.name === name);
  if (script === undefined) return { status: 404, body: { error: "not found" } };
  const { phase, source } = script.inline;
  return { status: 200, body: { name, phase, source, sha256: script.sha256 } };
};

/**
 * /api/crawls/:id/diagnostics (CAPTURE-49)。台本の行の `diagnosed` (capture-ledger の答えの本文そのまま) を返す。無い行は、
 * いまの組み合わせが型を通る答え (`diagnostics` が空。capture-ledger は hostTypes も添える)。行が無ければ 404。
 */
export const diagnosticsOf = (c) =>
  c === undefined
    ? { status: 404, body: { error: "not found" } }
    : { status: 200, body: c.diagnosed ?? { typescript: "6.0.3", hostTypes: "v0.7.0", diagnostics: [] } };

/**
 * POST /api/crawls/:id/inline/:name/fix (CAPTURE-49)。台本の行の `fixes` の、その名前の答え (`{ status, body }`。
 * capture-ledger の答えの本文そのまま) を返す。**Claude は呼ばない** —— 台本に無い行・名前は 404。
 */
export const fixOf = (c, name) => {
  const answer = c?.fixes?.[name];
  return answer === undefined
    ? { status: 404, body: { error: "not found" } }
    : { status: answer.status, body: answer.body };
};

/** クロールごとの値 (capture-ledger v0.67.0 の行の `variables`・`secrets`)。台本の行に無ければ、何も渡さなかったクロール。 */
const valuesIn = (c) => ({ variables: c.variables ?? {}, secrets: c.secrets ?? [], userAgent: c.userAgent ?? null });

/**
 * /api/crawls/:id。capture-ledger はほかの欄 (上限など) も返すが、workbench が読むのは seeds・rules・finishedAt・
 * error・scripts・replayBundle・dispatch・failures・variables・secrets なので、そこまでにしてある。受けた行は走らせたものと値を行に
 * 持たない (行の欄は一覧と揃えて試験が固定している) ので、`scripts` と `values` で渡す。規則は行に無ければ capture-ledger の既定。
 * `replayBundle` は一覧の行と同じ形 (capture-ledger も同じ関数で組む)。
 * `secrets` は capture-ledger v0.90.0 と同じく `{ name, path, editedAt, rotated, archive }` の列で、値は無い (`archive` は宣言の
 * 写しで、`"keep"` か null。台本の行も、この形で書く)。`failures` の要素は
 * `{ url, depth, reason, page }` (page はページの行の id。CAPTURE-18 で capture-ledger が足す)。
 */
export const crawlDetail = (c, scripts = c.scripts ?? [], rules = c.rules ?? DEFAULT_RULES, values = valuesIn(c)) => ({
  crawlId: c.crawlId,
  seeds: c.seeds,
  rules,
  state: c.state,
  stopReason: c.stopReason ?? null,
  finishedAt: c.finishedAt ?? null,
  error: c.error ?? null,
  scripts: scripts.map(detailScript),
  replayBundle: replayBundleOf(c),
  dispatch: c.dispatch ?? null,
  failures: (c.failures ?? []).map((f) => ({ url: f.url, depth: f.depth, reason: f.reason ?? null, page: f.page })),
  variables: values.variables,
  secrets: values.secrets,
  userAgent: values.userAgent ?? null,
});

/**
 * /api/crawls/:id/decisions。欄は capture-ledger v0.62.0 の src/api/crawls.ts と同じ。台本の行は
 * `decisions` と `robots` を持てる (無ければ空)。受けた行は何も辿っていないので空。
 */
export const decisionsOf = (c, rules = c.rules ?? DEFAULT_RULES) => ({
  crawlId: c.crawlId,
  rules,
  decisions: c.decisions ?? [],
  robots: c.robots ?? [],
});

/** BrowserHive の 4 つの level。台本の log に counts が無ければ、行をこれで数える。 */
const LEVELS = ["debug", "info", "warn", "error"];

const countsOf = (log) =>
  log.counts ?? Object.fromEntries(LEVELS.map((level) => [level, log.lines.filter((line) => line.level === level).length]));

/**
 * ページの 1 行。欄は CAPTURE-18 で capture-ledger が足す `GET /api/crawls/:id/pages` の形と同じ (id は数字だけの文字列)。
 * `logCounts` は台本の `log` から組み (level ごとの数と dropped)、`log` の無いページは null (数を読んでいない)。
 * `capturedAt` と `bundledRev` (CAPTURE-56) は WACZ の撮った時刻と、その WACZ が最初に入った合本の版で、台本の
 * ページから (WACZ の無いページ・どの版にも入っていないページは null)。
 */
export const pageRow = (p) => ({
  id: p.id,
  url: p.url,
  depth: p.depth ?? 0,
  state: p.state,
  reason: p.reason ?? null,
  taskId: p.taskId ?? null,
  archiveId: p.archiveId ?? null,
  capturedAt: p.capturedAt ?? null,
  bundledRev: p.bundledRev ?? null,
  logCounts: p.log === undefined ? null : { ...countsOf(p.log), dropped: p.log.dropped ?? 0 },
});

const DIGITS = /^[0-9]+$/;

/** capture-ledger の id の並び (bigserial を文字列で持つので、数として比べる)。 */
const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);

/**
 * /api/crawls/:id/pages。台本の行 `c` の `pages` を id の昇順で、`after` の後から `limit` 件 (既定 100・最大 500)。
 * `next` は続きが在れば返した最後の id、無ければ null。limit が整数でない・範囲の外、after が数字だけでなければ、
 * 行を探す前に 400 (Fastify の schema の形。capture-ledger の実物の文は、エンドポイントが出たら写す)。行が無ければ 404。
 */
export const pageList = (c, query) => {
  const after = query.get("after");
  const limit = query.get("limit");
  if (after !== null && !DIGITS.test(after)) return schemaError('querystring/after must match pattern "^[0-9]+$"');
  if (limit !== null && !/^-?[0-9]+$/.test(limit)) return schemaError("querystring/limit must be integer");
  if (limit !== null && Number(limit) < 1) return schemaError("querystring/limit must be >= 1");
  if (limit !== null && Number(limit) > 500) return schemaError("querystring/limit must be <= 500");
  if (c === undefined) return { status: 404, body: { error: "not found" } };
  const size = limit === null ? 100 : Number(limit);
  const rest = [...(c.pages ?? [])].sort(byId).filter((p) => after === null || BigInt(p.id) > BigInt(after));
  const pages = rest.slice(0, size).map(pageRow);
  return { status: 200, body: { pages, next: rest.length > size ? pages[pages.length - 1].id : null } };
};

/**
 * /api/crawls/:id/pages/:page/log。ページの id が数字だけでなければ 400、行かページが無ければ 404 (ほかの行の
 * ページも)。読めれば `{ page, log, reason: null }`、読めなければ `{ page, log: null, reason }` —— 理由は台本の
 * `logReason`、省けば taskId の無いページは not-captured、在れば no-log (ログを残す前の BrowserHive の取り込み)。
 */
export const pageLog = (c, raw) => {
  if (!DIGITS.test(raw)) return schemaError('params/page must match pattern "^[0-9]+$"');
  const p = (c?.pages ?? []).find((x) => x.id === raw);
  if (p === undefined) return { status: 404, body: { error: "not found" } };
  if (p.log === undefined) {
    const reason = p.logReason ?? (p.taskId === undefined || p.taskId === null ? "not-captured" : "no-log");
    return { status: 200, body: { page: pageRow(p), log: null, reason } };
  }
  const log = { lines: p.log.lines, counts: countsOf(p.log), dropped: p.log.dropped ?? 0 };
  return { status: 200, body: { page: pageRow(p), log, reason: null } };
};

/**
 * /api/archives の行。欄は capture-ledger の src/api/routes.ts (v0.57.4) と同じ。
 * 置き場の WACZ に、台本の「見えない」行 (hidden) を足し、台本の archives で欄を上書きする。
 * 見えない行は一覧に出るが、署名は出ない (capture-ledger の「見てよくない」と同じ 404 になる)。
 */
export const archiveRows = (names, s) =>
  [...names, ...(s.hidden ?? [])].map((name) => ({
    id: idOf(name),
    taskId: idOf(`task:${name}`),
    sourceUrl: `https://sandbox.test/${name}`,
    labels: ["sandbox"],
    waczComplete: true,
    capturedAt: s.capturedAt,
    objectKey: `sandbox/${name}`,
    ...(s.archives?.[name] ?? {}),
  }));

/**
 * 当たった所の断片。OpenSearch の highlight と同じく、本文の当たった所を `<em>` で包み、前後を少し残す
 * （1 断片・前後 30 字）。題だけに当たったなら無し（capture-ledger の highlight は本文だけ）。
 */
const fragmentOf = (text, q) => {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return undefined;
  const from = Math.max(0, at - 30);
  const to = Math.min(text.length, at + q.length + 30);
  return `${text.slice(from, at)}<em>${text.slice(at, at + q.length)}</em>${text.slice(at + q.length, to)}`;
};

/**
 * 検索のエンドポイント（GET /api/search）の答え。欄は capture-ledger の src/api/search.ts（CAPTURE-53 の後）と同じ:
 * `{ hits, total }` で、total は返した当たりの数。台本の `searchPages` を、capture-ledger と同じ決まりで引く ——
 * 写しの行が在るアーカイブでは写しの行だけ（文書の行は引かない。CAPTURE-48）、見えない行（`hidden`）は
 * 答えに出さない（capture-ledger は OpenFGA の can_view で落とす）。当たりは題か本文に、大小を問わず語を含む行。
 * capture-ledger は 400 で `q` の無い・空の・ほかの欄のある問いを断る（Fastify の schema の文）。
 */
export const searchOf = (names, s, params) => {
  const keys = [...params.keys()];
  const q = params.get("q");
  if (keys.some((k) => k !== "q")) {
    return { status: 400, body: { error: "Bad Request", message: "querystring must NOT have additional properties" } };
  }
  if (q === null || q === "") {
    return { status: 400, body: { error: "Bad Request", message: "querystring/q must NOT have fewer than 1 characters" } };
  }
  const hidden = new Set(s.hidden ?? []);
  const rows = archiveRows(names, s);
  const nameOf = (row) => [...names, ...(s.hidden ?? [])].find((n) => idOf(n) === row.id);
  const needle = q.toLowerCase();
  const hits = [];
  for (const archive of rows) {
    const name = nameOf(archive);
    if (name === undefined || hidden.has(name)) continue;
    const pages = s.searchPages?.[name] ?? [];
    const staged = pages.filter((p) => typeof p.stage === "string" && p.stage !== "");
    for (const page of staged.length > 0 ? staged : pages) {
      const title = page.title ?? "";
      const text = page.text ?? "";
      if (!title.toLowerCase().includes(needle) && !text.toLowerCase().includes(needle)) continue;
      const stage = typeof page.stage === "string" && page.stage !== "" ? page.stage : null;
      const fragment = fragmentOf(text, q);
      hits.push({
        archiveId: archive.id,
        stage,
        url: page.url ?? (stage === null ? archive.sourceUrl : `urn:browserhive:snapshot:${stage}:${archive.sourceUrl}`),
        title,
        text,
        textTruncated: page.textTruncated === true,
        textWithheld: page.textWithheld ?? null,
        objectKey: archive.objectKey,
        sourceUrl: archive.sourceUrl,
        labels: archive.labels,
        capturedAt: archive.capturedAt,
        ...(fragment !== undefined && { highlight: [fragment] }),
      });
    }
  }
  return { status: 200, body: { hits, total: hits.length } };
};

const httpUrl = (raw) => {
  try {
    const { protocol } = new URL(String(raw));
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

// ── 規則（capture-ledger v0.62.0 の src/crawl/rules.ts と scope.ts の写し）────────────
/** 規則を省いた頼みの並び (capture-ledger と同じ)。 */
const DEFAULT_RULES = [{ follow: "same-origin" }];
const SCOPES = new Set(["same-origin", "same-host", "same-site", "any"]);
const ACTIONS = ["follow", "capture", "skip"];
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const RANK = { "same-origin": 0, "same-host": 1, "same-site": 2, any: 3 };

/**
 * サイト (登録ドメイン)。**代役は Public Suffix List を持たない** —— ホスト名の最後の 2 ラベルで近似する。
 * `example.co.jp` を `co.jp` と読み違えるのは代役だけ (capture-ledger は tldts。docs の development に書いてある)。
 */
export const siteOf = (hostname) => hostname.split(".").slice(-2).join(".");

const parseUrl = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.hash = "";
  return { normalized: url.toString(), host: url.host, hostname: url.hostname, origin: url.origin };
};

const parsePattern = (raw) => {
  if (SCOPES.has(raw)) return { kind: "scope", scope: raw };
  if (HOSTNAME.test(raw)) return { kind: "domain", domain: raw };
  const url = parseUrl(raw);
  return url === undefined ? undefined : { kind: "prefix", url };
};

const under = (hostname, domain) => hostname === domain || hostname.endsWith(`.${domain}`);

const inScope = (url, seeds, scope) =>
  scope === "any" ||
  seeds.some((seed) =>
    scope === "same-site"
      ? siteOf(seed.hostname) === siteOf(url.hostname)
      : scope === "same-host"
        ? seed.host === url.host
        : seed.origin === url.origin,
  );

const matches = (url, pattern, seeds) =>
  pattern.kind === "scope"
    ? inScope(url, seeds, pattern.scope)
    : pattern.kind === "domain"
      ? under(url.hostname, pattern.domain)
      : url.normalized.startsWith(pattern.url.normalized);

/** 言い切れるときだけ覆いと言う (capture-ledger と同じ組)。 */
const covers = (a, b, seeds) => {
  if (a.kind === "scope" && a.scope === "any") return true;
  if (b.kind === "scope") return a.kind === "scope" && RANK[a.scope] >= RANK[b.scope];
  if (b.kind === "domain") {
    if (a.kind === "domain") return under(b.domain, a.domain);
    return a.kind === "scope" && a.scope === "same-site" && seeds.some((seed) => siteOf(seed.hostname) === siteOf(b.domain));
  }
  if (a.kind === "prefix") return b.url.normalized.startsWith(a.url.normalized);
  return b.url.normalized.startsWith(`${b.url.origin}/`) && matches(b.url, a, seeds);
};

const patternText = (pattern) =>
  pattern.kind === "scope" ? pattern.scope : pattern.kind === "domain" ? pattern.domain : pattern.url.normalized;

/** 上から当て、最初に当たった規則の動き。どれにも当たらなければ落とす。 */
const decide = (url, read, seeds) => read.find((rule) => matches(url, rule.pattern, seeds))?.action ?? "skip";

/**
 * 規則の並びを確かめる (capture-ledger の `checkRules`)。読めない行は覆いと起点の判定から外し、番号は頼まれたまま。
 */
export const checkRules = (rules, seeds) => {
  const read = rules.map((rule) => {
    const [action, raw] = Object.entries(rule)[0];
    const pattern = parsePattern(raw);
    return pattern === undefined ? undefined : { action, pattern };
  });
  const invalid = rules.flatMap((rule, i) =>
    read[i] === undefined ? [{ rule: i + 1, pattern: Object.values(rule)[0] }] : [],
  );
  const covered = read.flatMap((rule, j) => {
    if (rule === undefined) return [];
    const by = read.slice(0, j).findIndex((earlier) => earlier !== undefined && covers(earlier.pattern, rule.pattern, seeds));
    return by < 0 ? [] : [{ rule: j + 1, coveredBy: by + 1 }];
  });
  const usable = read.filter((rule) => rule !== undefined);
  const unfollowedSeeds = seeds.filter((seed) => decide(seed, usable, seeds) !== "follow").map((seed) => seed.normalized);
  return { read, invalid, covered, unfollowedSeeds };
};

/** `rules` の形を見る (capture-ledger の schema)。断るなら文を返す。 */
const rulesRefusal = (rules) => {
  if (!Array.isArray(rules)) return "body/rules must be array";
  if (rules.length < 1) return "body/rules must NOT have fewer than 1 items";
  if (rules.length > 32) return "body/rules must NOT have more than 32 items";
  for (const [i, rule] of rules.entries()) {
    const at = `body/rules/${String(i)}`;
    const keys = rule !== null && typeof rule === "object" ? Object.keys(rule) : [];
    if (keys.some((key) => !ACTIONS.includes(key))) return `${at} must NOT have additional properties`;
    if (keys.length > 1) return `${at} must NOT have more than 1 properties`;
    if (keys.length === 0) return `${at} must NOT have fewer than 1 properties`;
    const value = rule[keys[0]];
    if (typeof value !== "string" || value === "") return `${at}/${keys[0]} must NOT have fewer than 1 characters`;
    if (value.length > 2048) return `${at}/${keys[0]} must NOT have more than 2048 characters`;
  }
  return undefined;
};

/**
 * 始めるエンドポイントの規則の 400 (capture-ledger v0.62.0 と同じ順と文)。通れば、読んだ形で固定する規則を返す。
 */
const resolveRules = (rules, seeds) => {
  // 形は submitCrawl が先に見ている (schema の 400 は handler より前)
  const checked = checkRules(rules ?? DEFAULT_RULES, seeds);
  if (checked.invalid.length > 0) {
    return { status: 400, body: { error: "invalid rule patterns", rules: checked.invalid } };
  }
  if (checked.covered.length > 0) {
    return { status: 400, body: { error: "rules that can never match", rules: checked.covered } };
  }
  if (checked.unfollowedSeeds.length > 0) {
    return { status: 400, body: { error: "seeds the rules do not follow", seeds: checked.unfollowedSeeds } };
  }
  return { rules: checked.read.map(({ action, pattern }) => ({ [action]: patternText(pattern) })) };
};

/**
 * 確かめのエンドポイント (`GET /api/crawl-rules/check`)。答えの形は capture-ledger v0.62.0 と同じ。規則は「動き:当てる物」で、
 * 動きの名前が違えば schema の 400。
 */
export const crawlRulesCheck = (seedTexts, ruleTexts) => {
  const bad = ruleTexts.find((text) => !/^(follow|capture|skip):/.test(text));
  if (bad !== undefined || ruleTexts.length > 32) {
    return schemaError('querystring/rule/0 must match pattern "^(follow|capture|skip):"');
  }
  const asked = ruleTexts.map((text) => {
    const at = text.indexOf(":");
    return { [text.slice(0, at)]: text.slice(at + 1) };
  });
  const parsed = seedTexts.map(parseUrl).filter((seed) => seed !== undefined);
  const checked = checkRules(asked, parsed);
  const coveredBy = new Map(checked.covered.map((c) => [c.rule, c.coveredBy]));
  const unfollowed = new Set(checked.unfollowedSeeds);
  const seeds = seedTexts.map((raw) => {
    const url = parseUrl(raw);
    return url === undefined
      ? { url: raw, valid: false }
      : { url: url.normalized, valid: true, site: siteOf(url.hostname), followed: !unfollowed.has(url.normalized) };
  });
  const rules = asked.map((rule, i) => {
    const [action, raw] = Object.entries(rule)[0];
    const read = checked.read[i];
    const by = coveredBy.get(i + 1);
    return {
      rule: i + 1,
      action,
      kind: read === undefined ? "invalid" : read.pattern.kind,
      pattern: read === undefined ? raw : patternText(read.pattern),
      ...(by === undefined ? {} : { coveredBy: by }),
    };
  });
  return {
    status: 200,
    body: {
      seeds,
      rules,
      ok: checked.invalid.length === 0 && checked.covered.length === 0 && seeds.every((seed) => seed.valid && seed.followed === true),
    },
  };
};

/** その場の TS の名前の綴り (capture-ledger の schema と同じ。`inline-` と合わせて 64 字まで)。 */
const INLINE_NAME = /^[a-z][a-z0-9-]*$/;
/** クロールごとの値の名前の綴り (capture-ledger v0.67.0 の schema と capture-scripts の check.mjs と同じ。64 字まで)。 */
const VALUE_NAME = /^[a-z][a-z0-9_]*$/;
/** 宣言したシークレットを置く Windmill のフォルダ (capture-ledger と capture-scheduler の決まり)。 */
const SECRETS_FOLDER = "f/waggle_secrets/";
/** `POST /api/crawls` の body の鍵 (capture-ledger v0.67.0 の schema。`additionalProperties: false`)。外の鍵は 400。 */
const BODY_KEYS = ["userAgent", "seeds", "rules", "maxDepth", "maxPages", "perHostDelayMs", "hostParallelism", "scripts", "variables"];
/** Windmill の代わり (台本の `windmillSecrets`・`windmillVariables`)。試験が渡さなければ、何も置いていない Windmill。 */
const NO_WINDMILL = { secrets: [], variables: [], editedAt: null };
/**
 * 配備の形式 (capture-ledger の `CAPTURE_LEDGER_CAPTURE_FORMATS`) の代わり (台本の `captureFormats`。小文字の名前の並び)。
 * 試験と台本が渡さなければ、capture-ledger の既定と同じ `wacz` だけ。
 */
const DEFAULT_FORMATS = ["wacz"];
/** 隠すシークレットの値を置き換えられない形式 (capture-ledger v0.90.0 の `FORMATS_WITHOUT_REPLACEMENT`。この順で名指す)。 */
const FORMATS_WITHOUT_REPLACEMENT = ["png", "webp", "html", "mhtml"];

/**
 * Fastify が schema の誤りで返す本文の形 (capture-ledger の 400 と同じ。workbench は `message` を出す)。
 * 文は capture-ledger v0.58.0 の実物から写した —— 要素は鍵が 1 つの object なので、誤りの場所だけが出る。
 */
const schemaError = (message) => ({
  status: 400,
  body: { statusCode: 400, code: "FST_ERR_VALIDATION", error: "Bad Request", message },
});

/** `scripts` の 1 要素の形を見る。断るなら文を返す。 */
const elementRefusal = (element, i) => {
  const at = `body/scripts/${String(i)}`;
  const keys = element !== null && typeof element === "object" ? Object.keys(element) : [];
  if (keys.some((key) => key !== "catalog" && key !== "inline")) {
    return `${at} must NOT have additional properties`;
  }
  if (keys.length > 1) return `${at} must NOT have more than 1 properties`;
  if (keys.length === 0) return `${at} must NOT have fewer than 1 properties`;
  if ("catalog" in element) {
    return typeof element.catalog === "string" && element.catalog !== ""
      ? undefined
      : `${at}/catalog must NOT have fewer than 1 characters`;
  }
  const { name, phase, source, params } = element.inline ?? {};
  if (typeof name !== "string" || !INLINE_NAME.test(name) || name.length > 57) {
    return `${at}/inline/name must match pattern "^[a-z][a-z0-9-]*$"`;
  }
  if (phase !== "behavior" && phase !== "preload") {
    return `${at}/inline/phase must be equal to one of the allowed values`;
  }
  if (typeof source !== "string" || source === "") {
    return `${at}/inline/source must NOT have fewer than 1 characters`;
  }
  return paramsRefusal(params, `${at}/inline`);
};

/**
 * 宣言 (`params`) の形を見る (capture-ledger v0.90.0 の schema)。断るなら文を返す。名前は `^[a-z][a-z0-9_]*$` で 64 字まで、
 * kind は variable か secret、required は真偽値、summary は文字列 (その場の TS では省ける)、archive は `"keep"` だけ
 * (値を WARC に残す。省けば隠す)、知らない鍵は断る。
 * kind: variable と、同じ名前が 2 度ある宣言は schema では見ず、`paramsReading` が capture-ledger の handler と同じ文で断る。
 */
const paramsRefusal = (params, at) => {
  if (params === undefined) return undefined;
  if (!Array.isArray(params)) return `${at}/params must be array`;
  if (params.length > 32) return `${at}/params must NOT have more than 32 items`;
  for (const [i, p] of params.entries()) {
    const here = `${at}/params/${String(i)}`;
    if (p === null || typeof p !== "object" || Array.isArray(p)) return `${here} must be object`;
    for (const key of ["name", "kind"]) {
      if (!(key in p)) return `${here} must have required property '${key}'`;
    }
    if (Object.keys(p).some((key) => !["name", "kind", "required", "summary", "archive"].includes(key))) {
      return `${here} must NOT have additional properties`;
    }
    if (typeof p.name !== "string" || !VALUE_NAME.test(p.name) || p.name.length > 64) {
      return `${here}/name must match pattern "^[a-z][a-z0-9_]*$"`;
    }
    if (p.kind !== "variable" && p.kind !== "secret") return `${here}/kind must be equal to one of the allowed values`;
    if (p.required !== undefined && typeof p.required !== "boolean") return `${here}/required must be boolean`;
    if (p.summary !== undefined && typeof p.summary !== "string") return `${here}/summary must be string`;
    // capture-ledger の Ajv は数・真偽・null を文字列に読み替えてから enum で断る。読み替えられないのは object だけ
    if (typeof p.archive === "object" && p.archive !== null) return `${here}/archive must be string`;
    if (p.archive !== undefined && p.archive !== "keep") return `${here}/archive must be equal to one of the allowed values`;
  }
  return undefined;
};

/**
 * その場の TS の宣言を、capture-ledger の handler (schema の後) と同じく読む。`params` に書けるのはシークレットだけで、変数なら 400、
 * 同じ名前が 2 度あれば 400 (どちらも `{ error: "invalid params", script, hint }`。文は capture-ledger と同じ)。
 * 通れば、省いた required を false にした宣言。`archive` は書いたときだけ写す (capture-ledger の readParams。写し忘れると、
 * 残すつもりの値が黙って隠れる)。
 */
const paramsReading = (inline) => {
  if (inline.params === undefined) return { params: undefined };
  if (inline.params.some((p) => p.kind === "variable")) {
    return {
      status: 400,
      body: {
        error: "invalid params",
        script: `inline-${inline.name}`,
        hint: "params に書けるのはシークレットだけ。変数は source の defineParams で宣言する",
      },
    };
  }
  const out = [];
  for (const p of inline.params) {
    if (out.some((q) => q.name === p.name)) {
      return {
        status: 400,
        body: { error: "invalid params", script: `inline-${inline.name}`, hint: `params に ${p.name} が 2 度ある` },
      };
    }
    out.push({
      name: p.name,
      kind: p.kind,
      required: p.required ?? false,
      ...(p.summary === undefined ? {} : { summary: p.summary }),
      ...(p.archive === undefined ? {} : { archive: "keep" }),
    });
  }
  return { params: out };
};

/**
 * `variables` の形を見る (capture-ledger の schema)。断るなら文を返す。名前は宣言と同じ綴りで 32 個まで、値は文字列で 4,096 字まで。
 */
const variablesRefusal = (variables) => {
  if (variables === undefined) return undefined;
  if (variables === null || typeof variables !== "object" || Array.isArray(variables)) return "body/variables must be object";
  const names = Object.keys(variables);
  if (names.length > 32) return "body/variables must NOT have more than 32 properties";
  for (const name of names) {
    if (!VALUE_NAME.test(name) || name.length > 64) return "body/variables property name must be valid";
    if (typeof variables[name] !== "string") return `body/variables/${name} must be string`;
    if (variables[name].length > 4096) return `body/variables/${name} must NOT have more than 4096 characters`;
  }
  return undefined;
};

/** `defineParams(z.object({ … }))` の中身。 */
const DEFINE_PARAMS = /defineParams\(\s*z\.object\(\{([\s\S]*?)\}\)\s*,?\s*\)/;
/** 中身の 1 行: 名前と、`string()` か `enum([…])` と、続く呼び出しの列。 */
const DECLARED_FIELD =
  /([a-z][a-z0-9_]*)\s*:\s*z\s*\.\s*(?:string\(\)|enum\(\[([^\]]*)\]\))((?:\s*\.\s*[a-z]+\((?:"(?:[^"\\]|\\.)*"|\d*)\))*)/g;
const DECLARED_CALL = /\.\s*([a-z]+)\(("(?:[^"\\]|\\.)*"|\d*)\)/g;

/**
 * その場の TS の `defineParams(z.object({ … }))` を読む。**代役だけの近道** —— 本物は ts-compile-service が構文木を歩き、
 * 呼べる形を外れれば読めないと言う。ここは見本と docs に出てくる形 (`"` の文字列と数のリテラル) だけを正規表現で読む。
 * 答えの形は本物と同じで、鍵は name・kind・required・summary (`.describe` が無ければ無い)・schema
 * (type・minLength・maxLength・enum)。`/api/scripts/check` と `submitCrawl` の両方がここを読む。
 */
export const readDeclared = (source) =>
  [...(DEFINE_PARAMS.exec(source)?.[1] ?? "").matchAll(DECLARED_FIELD)].map(([, name, list, chain]) => {
    const schema = { type: "string" };
    if (list !== undefined) schema.enum = [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    let required = true;
    let summary;
    for (const [, method, argument] of chain.matchAll(DECLARED_CALL)) {
      if (method === "min" || method === "length") schema.minLength = Number(argument);
      if (method === "max" || method === "length") schema.maxLength = Number(argument);
      if (method === "optional") required = false;
      if (method === "describe") summary = JSON.parse(argument);
    }
    return { name, kind: "variable", required, ...(summary === undefined ? {} : { summary }), schema };
  });

/**
 * POST /api/scripts/check。書いている途中のその場の TS が宣言した変数を返す (capture-ledger の `src/api/scripts.ts`)。行は立たない。
 * 本物は TS の誤りも `diagnostics` に返す (`BH0001` は除く) が、代役は型を検査しないので、欄が出ない理由の 2 つだけを言う。
 */
export const checkInline = (body) => {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return schemaError("body must be object");
  if (Object.keys(body).some((key) => key !== "source" && key !== "phase")) {
    return schemaError("body must NOT have additional properties");
  }
  for (const key of ["source", "phase"]) {
    if (!(key in body)) return schemaError(`body must have required property '${key}'`);
  }
  if (typeof body.source !== "string") return schemaError("body/source must be string");
  if (body.phase !== "preload" && body.phase !== "behavior") {
    return schemaError("body/phase must be equal to one of the allowed values");
  }
  const declares = /\bdefineParams\(/.test(body.source);
  const said = (code, message) => ({ file: "inline-check.ts", code, message });
  return {
    status: 200,
    body: {
      params: readDeclared(body.source),
      diagnostics: [
        ...(declares && !DEFINE_PARAMS.test(body.source)
          ? [said("BH0002", "defineParams の引数を読めない (z.object({ … }) をその場に書く)")]
          : []),
        ...(declares && body.phase === "preload"
          ? [said("BH0004", "preload では defineParams を使えない (受け皿が無い)")]
          : []),
      ],
    },
  };
};

/** 値が宣言の形に合わないなら、人に見せる文 (capture-ledger の `crawl/values.ts` の `shapeProblem`)。長さは code point で数える。 */
const shapeProblem = (name, value, schema) => {
  const length = [...value].length;
  if (schema.enum !== undefined && !schema.enum.includes(value)) return `${name} は ${schema.enum.join("・")} のどれか`;
  if (schema.minLength !== undefined && length < schema.minLength) return `${name} は ${String(schema.minLength)} 字以上`;
  if (schema.maxLength !== undefined && length > schema.maxLength) return `${name} は ${String(schema.maxLength)} 字まで`;
  return undefined;
};

/**
 * クロールごとの値を、capture-ledger の route と `checkValues`・`resolveSecrets` と同じ順で解く: 必須の変数が無い (capture-ledger は compile の
 * 答えの `BH0001` で断る。行も立たない) → 同じ名前を別の種類か別の形で宣言している、WARC に残すかが食い違う → シークレットの
 * 名前を変数で渡している → 知らない変数 → 値が宣言の形に合わない → シークレットが多すぎる → 宣言したシークレットが
 * Windmill に在るか → 在るが secret でない → 隠すシークレットを送るのに、配備の形式 (`formats`) が値を置き換えられない
 * 物を頼む (capture-ledger v0.90.0 の `formatsRefusal`)。
 * 宣言は走らせるものから集める。登録済みのスクリプトは版の `params`、その場の TS は変数が source の `defineParams`
 * (`readDeclared`) でシークレットが `inline.params`。同じ名前の宣言は 1 つにまとめる (名前順)。required でないシークレットが
 * Windmill に無ければ、渡さないだけで断らない (スクリプトは undefined を読む)。形式の 400 が見るのも、Windmill に在って
 * 送る物だけ。通れば、行に固定する `variables` と `secrets` (名前・path・確かめたときの edited_at・途中で替わったか・
 * WARC に残すか) を返す。
 *
 * `BH0001` の誤りに行と列は無い (代役は構文木を読まない)。本物には在る。
 */
const resolveValues = (variables = {}, run, windmill, formats = DEFAULT_FORMATS) => {
  const declared = new Map();
  const lacking = [];
  for (const s of run) {
    const params = s.inline === undefined ? (s.params ?? []) : [...readDeclared(s.inline.source), ...(s.inline.params ?? [])];
    for (const p of params) {
      const entry = declared.get(p.name) ?? {
        kinds: new Set(),
        schemas: new Map(),
        archives: new Set(),
        required: false,
        declaredBy: [],
      };
      entry.kinds.add(p.kind);
      if (p.schema !== undefined) entry.schemas.set(JSON.stringify(p.schema), p.schema);
      // 省いた宣言は隠す。変数は archive を持てないので、いつも隠す側 (種類の違いは kinds が先に言う)
      entry.archives.add(p.archive ?? "hide");
      entry.required = entry.required || p.required === true;
      entry.declaredBy.push(s.id);
      declared.set(p.name, entry);
      if (p.kind === "variable" && p.required === true && !(p.name in variables)) {
        lacking.push({ file: `${s.id}.ts`, code: "BH0001", message: `必須の変数 ${p.name} が渡されていない`, name: p.name });
      }
    }
  }
  const names = [...declared.keys()].sort();
  const refuse = (body) => ({ status: 400, body });
  if (lacking.length > 0) {
    return refuse({
      error: "missing variables",
      names: [...new Set(lacking.map((d) => d.name))],
      diagnostics: lacking.map(({ file, code, message }) => ({ file, code, message })),
    });
  }
  const conflicting = names.filter((name) => {
    const { kinds, schemas, archives } = declared.get(name);
    return kinds.size > 1 || schemas.size > 1 || archives.size > 1;
  });
  if (conflicting.length > 0) return refuse({ error: "conflicting params", names: conflicting });
  const ofKind = (kind) => names.filter((name) => declared.get(name).kinds.has(kind));
  const given = Object.keys(variables).sort();
  const secretNames = ofKind("secret");
  const asVariable = given.filter((name) => secretNames.includes(name));
  if (asVariable.length > 0) return refuse({ error: "secrets cannot be passed as variables", names: asVariable });
  const variableNames = ofKind("variable");
  const unknown = given.filter((name) => !variableNames.includes(name));
  if (unknown.length > 0) return refuse({ error: "unknown variables", names: unknown });
  const misfits = given.flatMap((name) => {
    const [schema] = declared.get(name).schemas.values();
    const problem = schema === undefined ? undefined : shapeProblem(name, variables[name], schema);
    return problem === undefined ? [] : [{ name, problem }];
  });
  if (misfits.length > 0) {
    return refuse({
      error: "invalid variables",
      names: misfits.map((m) => m.name),
      hint: misfits.map((m) => m.problem).join(" / "),
    });
  }
  if (secretNames.length > 32) return refuse({ error: "too many secrets", count: secretNames.length, max: 32 });
  const wanted = secretNames.map((name) => ({
    name,
    path: `${SECRETS_FOLDER}${name}`,
    required: declared.get(name).required,
    declaredBy: declared.get(name).declaredBy,
    ...(declared.get(name).archives.has("keep") && { archive: "keep" }),
  }));
  const named = ({ name, path, declaredBy }) => ({ name, path, declaredBy });
  const absent = wanted.filter((s) => !windmill.secrets.includes(s.name));
  const plain = absent.filter((s) => windmill.variables.includes(s.name));
  const unknownSecrets = absent.filter((s) => s.required && !windmill.variables.includes(s.name));
  if (unknownSecrets.length > 0) {
    return refuse({
      error: "unknown secrets",
      secrets: unknownSecrets.map(named),
      hint: unknownSecrets.map((s) => `wmill variable add <value> ${s.path} --secret`).join(" / "),
    });
  }
  if (plain.length > 0) return refuse({ error: "not a secret variable", secrets: plain.map(named) });
  const secrets = wanted
    .filter((s) => windmill.secrets.includes(s.name))
    .map((s) => ({ name: s.name, path: s.path, editedAt: windmill.editedAt, rotated: null, archive: s.archive ?? null }));
  // 隠す物が在るのに、配備の形式が値を置き換えられない物を頼む。通すと BrowserHive が取り込みのたびに 400 で断る
  const hidden = secrets.filter((s) => s.archive !== "keep").map((s) => s.name);
  const asked = FORMATS_WITHOUT_REPLACEMENT.filter((format) => formats.includes(format));
  if (hidden.length > 0 && asked.length > 0) {
    return refuse({
      error: "formats that cannot hide secrets",
      formats: asked,
      names: hidden,
      hint:
        `CAPTURE_LEDGER_CAPTURE_FORMATS の ${asked.join("・")} は値を置き換えられない (BrowserHive が断る)。` +
        `形式から外すか、値を WARC に残すなら宣言に archive: "keep" と書く`,
    });
  }
  return { variables, secrets };
};

/**
 * 走らせるものを、capture-ledger (v0.61.0) と同じ順で解く: 形 (schema) → 重ね → 登録されていない id →
 * 起点に合わないサイト用のスクリプト。省けば既定の顔ぶれ (`defaultSet`) で、それが空なら 400。
 * その場の TS は `inline-<name>`・版 1 で、sha256 は source から打つ (capture-ledger と同じ)。対象サイトは持たない。
 */
const resolveRun = (scripts, versions, hosts) => {
  if (scripts === undefined) {
    const chosen = defaultSet(versions, hosts);
    return chosen.length > 0 ? { scripts: chosen } : emptyDefault(versions);
  }
  if (!Array.isArray(scripts)) return schemaError("body/scripts must be array");
  for (const [i, element] of scripts.entries()) {
    const refused = elementRefusal(element, i);
    if (refused !== undefined) return schemaError(refused);
  }
  // その場の TS の宣言を読む (capture-ledger の readParams。schema の後、名指しを解く前)。省いた required は false に
  const read = [];
  for (const element of scripts) {
    if (!("inline" in element)) {
      read.push(element);
      continue;
    }
    const reading = paramsReading(element.inline);
    if (reading.status !== undefined) return reading;
    read.push({ inline: { ...element.inline, ...(reading.params === undefined ? {} : { params: reading.params }) } });
  }
  scripts = read;
  const ids = scripts.map((r) => ("catalog" in r ? r.catalog : `inline-${r.inline.name}`));
  const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (twice.length > 0) {
    return { status: 400, body: { error: "duplicate script ids", ids: twice } };
  }
  // 名指しは有効かどうかを見ない（capture-ledger v0.64.0 の resolveScripts）—— 既定に入らないスクリプトも、名指せば最新版が走る
  const catalog = latestOf(versions);
  const missing = [
    ...new Set(
      scripts
        .filter((r) => "catalog" in r && !catalog.some((c) => c.id === r.catalog))
        .map((r) => r.catalog),
    ),
  ];
  if (missing.length > 0) {
    return { status: 400, body: { error: "unknown script ids", ids: missing } };
  }
  const run = scripts.map((r) =>
    "catalog" in r
      ? catalog.find((c) => c.id === r.catalog)
      : {
          id: `inline-${r.inline.name}`,
          version: 1,
          phase: r.inline.phase,
          sha256: sha256Of(r.inline.source),
          inline: r.inline,
        },
  );
  const offsite = run.filter((s) => !onSeed(s.sites ?? [], hosts));
  if (offsite.length > 0) {
    return {
      status: 400,
      body: {
        error: "site scripts need a seed on their site",
        ids: offsite.map((s) => s.id),
        hint: offsite.map((s) => `${s.id}: ${s.sites.join(", ")}`).join(" / "),
      },
    };
  }
  return { scripts: run };
};

/**
 * 既定を頼まれたのに、既定が空。文は capture-ledger v0.61.3 の src/api/crawls.ts と同じ —— スクリプトは在るのに
 * 全部が別のサイト用なら、「スクリプトが無い」とは言わない (取り込み直しても直らない)。
 */
const emptyDefault = (versions) => {
  const enabled = latestEnabled(versions);
  if (enabled.length > 0) {
    return {
      status: 400,
      body: {
        error: "no default scripts for these seeds",
        hint:
          enabled.map((s) => `${s.id}: ${s.sites.join(", ")}`).join(" / ") +
          " (run nothing on purpose: send scripts: [])",
      },
    };
  }
  return {
    status: 400,
    body: {
      error: "no scripts are registered",
      hint: "pnpm run scripts import .upstream/capture-scripts (run nothing on purpose: send scripts: [])",
    },
  };
};

/**
 * 台本のスクリプト（版の並び）に source を読み込む。source は sandbox/catalog の写し（capture-scripts のファイル）で、
 * sha256 と bytes は capture-ledger と同じく source から数える（手で書いた sha256 は、本物の
 * 中身と結び付かない）。欄は capture-ledger v0.61.0 の 1 版のエンドポイント（`GET /api/scripts/:id/versions/:version`）と同じ。
 */
export const catalogOf = (s, read = readBeside) =>
  (s.catalog ?? []).map((v) => {
    const source = read(v.file);
    return {
      id: v.id,
      version: v.version,
      phase: v.phase,
      sha256: sha256Of(source),
      sites: v.sites ?? [],
      enabled: v.enabled ?? true,
      bytes: Buffer.byteLength(source, "utf8"),
      createdAt: v.createdAt,
      source,
      options: v.options ?? {},
      // 宣言 (catalog.json の params)。capture-ledger v0.67.0 は版ごとに持ち、一覧と 1 版のエンドポイントに出す。無ければ空
      params: v.params ?? [],
    };
  });

/**
 * 各 id の最新版を、台本の `catalog` に現れた順で（capture-ledger の既定の実行順。capture-scripts の catalog.json の並びの写し）。
 * 有効かどうかは見ない（capture-ledger の resolveScripts の名指しの側）。
 */
export const latestOf = (versions) =>
  [...new Set(versions.map((v) => v.id))].map((id) =>
    versions.filter((v) => v.id === id).reduce((a, b) => (b.version > a.version ? b : a)),
  );

/**
 * 有効な各 id の最新版を同じ順で。サイト用のスクリプトも入る（capture-ledger の enabledLatest。既定の顔ぶれの元）。順は
 * 無効な版も数えて決める —— capture-ledger の順は id に 1 つなので、一覧のエンドポイントと既定の順はずれない。
 */
export const latestEnabled = (versions) => pickable(versions).filter((v) => v.enabled);

/**
 * 一覧のエンドポイント（`GET /api/scripts`）の顔ぶれ。各 id に 1 行で、既定で走る版（有効な版の中の最新）があればそれ、
 * 無ければ最新版を `enabled: false` で（capture-ledger v0.64.0 の pickable）。既定に入らないスクリプトも、名指せば
 * 走るので載せる。
 */
export const pickable = (versions) =>
  latestOf(versions).map((latest) => latestOf(versions.filter((v) => v.id === latest.id && v.enabled))[0] ?? latest);

/**
 * `GET /api/scripts` の行。身元と対象サイトと enabled に、宣言 `params` を添える（capture-ledger v0.67.0。新しいクロールの画面が
 * 変数の欄をこれから描く）。source・options・bytes は一覧に無い（capture-ledger と同じ）。
 */
export const scriptRows = (versions) =>
  pickable(versions).map(({ id, version, phase, sha256, sites, enabled, params }) => ({
    id,
    version,
    phase,
    sha256,
    sites,
    enabled,
    params,
  }));

/** 対象サイトの無いスクリプトはいつでも、サイト用のスクリプトは対象サイトのどれかが起点のホストにあるとき（capture-ledger の onSeed）。 */
const onSeed = (sites, hosts) => sites.length === 0 || sites.some((site) => hosts.has(site));

/**
 * 既定の顔ぶれ: 有効な各 id の最新版のうち、対象サイトの無い物と、起点に合うサイト用の物（カタログの順）。
 * **最新版を選んでから対象サイトで絞る** —— capture-ledger の resolveScripts と同じ順。逆にすると、対象サイトを付け直した id の
 * 対象サイトの無い古い版が出てくる。
 */
export const defaultSet = (versions, hosts) => latestEnabled(versions).filter((v) => onSeed(v.sites, hosts));

/** GET /api/scripts/:id/versions。新しい順、**source は返さない**。無い id は 404。 */
export const versionsOf = (versions, id) => {
  const mine = versions.filter((v) => v.id === id).sort((a, b) => b.version - a.version);
  if (mine.length === 0) return { status: 404, body: { error: "not found" } };
  return {
    status: 200,
    body: {
      id,
      versions: mine.map(({ version, phase, sha256, sites, params, enabled, bytes, createdAt }) => ({
        version,
        phase,
        sha256,
        sites,
        params,
        enabled,
        bytes,
        createdAt,
      })),
    },
  };
};

/**
 * GET /api/scripts/:id/versions/:version。版が 1 以上の整数でなければ 400（文は capture-ledger v0.60.0 の実物から
 * 写した）、無ければ 404。有効かどうかは見ない。
 */
export const versionOf = (versions, id, raw) => {
  if (!/^\d+$/.test(raw)) return schemaError("params/version must be integer");
  if (Number(raw) < 1) return schemaError("params/version must be >= 1");
  const one = versions.find((v) => v.id === id && v.version === Number(raw));
  return one === undefined ? { status: 404, body: { error: "not found" } } : { status: 200, body: one };
};

/** GET /api/host-types。台本の `hostTypes` の file を読む。台本に無ければ 404（取り込んでいない capture-ledger）。 */
export const hostTypesOf = (s, read = readBeside) => {
  if (s.hostTypes === undefined) return { status: 404, body: { error: "not found" } };
  const source = read(s.hostTypes.file);
  return {
    status: 200,
    body: {
      version: s.hostTypes.version,
      sha256: sha256Of(source),
      createdAt: s.hostTypes.createdAt,
      source,
      bytes: Buffer.byteLength(source, "utf8"),
    },
  };
};

/**
 * `POST /api/crawls` を真似る。受けたら `rows` の先頭に足す (新しい順)。
 *
 * 答えの文と形は capture-ledger の src/api/crawls.ts から写した (v0.58.0。対象サイトの 400 と既定が空の 400 は
 * v0.61.0。試験が固定する)。
 * **走行中の 1 本は、受けた行だけで数える** —— 台本の走行中の行は飾りで、それで 409 に
 * すると何も始められない。409 を見たいなら、走っている間にもう 1 度始める。
 *
 * `versions` はスクリプトの版の並び (`catalogOf`)。起点のホスト (capture-ledger と同じく `hostname`。ポートは見ない) で
 * 既定を選び、名指しを照らす。走らせたものと値は受けた行の `scripts`・`variables`・`secrets` に持ち、一覧の行
 * (`submittedRow`) には出さない。`windmill` は Windmill の代わり (台本の `windmillSecrets`・`windmillVariables`)、
 * `formats` は配備の形式の代わり (台本の `captureFormats`)。
 */
export const submitCrawl = (rows, body, now, runsSeconds, versions, windmill = NO_WINDMILL, formats = DEFAULT_FORMATS) => {
  // 知らない鍵 (消した scriptIds・scope も) は、schema の 400 (capture-ledger は additionalProperties: false)
  if (body !== null && typeof body === "object" && Object.keys(body).some((key) => !BODY_KEYS.includes(key))) {
    return schemaError("body must NOT have additional properties");
  }
  if (body !== null && typeof body === "object" && "rules" in body) {
    const refused = rulesRefusal(body.rules);
    if (refused !== undefined) return schemaError(refused);
  }
  if (body !== null && typeof body === "object" && "variables" in body) {
    const refused = variablesRefusal(body.variables);
    if (refused !== undefined) return schemaError(refused);
  }
  if (!Array.isArray(body?.seeds)) {
    return { status: 400, body: { error: "seeds is required" } };
  }
  // capture-ledger と同じ順と文 (schema は文字列だけを見て、形は handler が読める文で断る)
  if ("userAgent" in body && typeof body.userAgent !== "string") return schemaError("body/userAgent must be string");
  const userAgent = (body.userAgent ?? "").trim();
  if (userAgent !== "" && !/^[\x20-\x7e]{1,512}$/.test(userAgent)) {
    return { status: 400, body: { error: "userAgent must be printable ASCII, at most 512 characters" } };
  }
  if (body.seeds.length === 0) return schemaError("body/seeds must NOT have fewer than 1 items");
  if (!body.seeds.every(httpUrl)) {
    return { status: 400, body: { error: "every seed must be an http(s) URL" } };
  }
  // 規則の誤りは起点の次 (capture-ledger と同じ順)。走らせるものの誤りも、走行中でも 400 が先 —— capture-ledger は解いてから
  // 行を立て、409 は行を立てる所で出る
  const ruled = resolveRules(body.rules, body.seeds.map(parseUrl));
  if (ruled.status !== undefined) return ruled;
  const hosts = new Set(body.seeds.map((seed) => new URL(seed).hostname));
  const run = resolveRun(body.scripts, versions, hosts);
  if (run.status !== undefined) return run;
  // 値の誤り (必須の変数が無い・知らない変数・形に合わない値・Windmill に無いシークレット・隠せない形式) も、行を立てる前 ——
  // 走行中でも 409 より先
  const valued = resolveValues(body.variables, run.scripts, windmill, formats);
  if (valued.status !== undefined) return valued;
  const running = rows.find((row) => now < row.startedAt + row.runsSeconds * 1000);
  if (running !== undefined) {
    return {
      status: 409,
      body: {
        error: "a crawl is already in progress",
        crawlId: running.crawlId,
        startedAt: new Date(running.startedAt).toISOString(),
      },
    };
  }
  const row = {
    crawlId: randomUUID(),
    seeds: body.seeds,
    startedAt: now,
    runsSeconds,
    scripts: run.scripts,
    rules: ruled.rules,
    variables: valued.variables,
    secrets: valued.secrets,
    userAgent: userAgent === "" ? null : userAgent,
    maxDepth: body.maxDepth ?? 2,
  };
  rows.unshift(row);
  return { status: 202, body: { crawlId: row.crawlId } };
};

/** 受けた行を /api/crawls の 1 行に (欄は crawlRow と同じ)。runsSeconds の間は走行中、その後は完走。 */
export const submittedRow = (row, now) => {
  const end = row.startedAt + row.runsSeconds * 1000;
  const done = now >= end;
  return {
    crawlId: row.crawlId,
    state: done ? "succeeded" : "running",
    stopReason: done ? "completed" : null,
    seeds: row.seeds,
    requestedBy: "sandbox",
    orgId: "acme",
    startedAt: new Date(row.startedAt).toISOString(),
    finishedAt: done ? new Date(end).toISOString() : null,
    maxDepth: row.maxDepth,
    pagesDiscovered: 0,
    pagesCaptured: done ? row.seeds.length : 0,
    pagesFailed: 0,
    error: null,
    waczCount: 0,
    lastJob: null,
    dispatch: null,
    // 受けた行は WACZ を持たないので、合本も無い
    replayBundle: null,
    schedule: null,
    scheduledFor: null,
    scheduleMissed: 0,
  };
};

/** 署名の代わりの URL。置き場に在る名前だけ。見えない行と、知らない id は undefined。 */
export const signedUrlOf = (id, names) => {
  const name = names.find((n) => idOf(n) === id);
  return name === undefined
    ? undefined
    : { url: pathToFileURL(resolve(SAMPLES, name)).href, expiresIn: 300 };
};

/** IdP の代役のプール。workbench の `sandbox/sandbox.env` の WORKBENCH_OIDC_ISSUER と同じ。 */
const SANDBOX_POOL = "/sandbox-pool";
/** ホストから見た代役の在り処 (docker-compose.yml が 127.0.0.1:17070 に出す)。 */
const SANDBOX_ORIGIN = "http://127.0.0.1:17070";
/** 見本のトークン。署名は無い —— 名乗りの欄だけを workbench の上の行に出すため。 */
const SANDBOX_TOKEN = `sandbox.${Buffer.from(
  JSON.stringify({ username: "sandbox", "cognito:groups": ["acme"], token_use: "access" }),
).toString("base64url")}.unsigned`;

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

/** 置き場の WACZ の名前。並びは名前順。 */
const samples = () =>
  readdirSync(SAMPLES)
    .filter((name) => name.endsWith(".wacz"))
    .sort();

/**
 * 読み直す関数を包み、**読めない間が短ければ、前に読めたもので答える**。
 *
 * host で rename して置き換えたファイル (`sed -i` や、多くの editor の保存) は、コンテナの中からは
 * 置き換えの直後のしばらく ENOENT に見える (container 1.5.0 で実測)。その場で書き直す editor
 * なら、空や途中の JSON が読める。どちらもすぐ終わるので、その間は前のもので答える。
 * 読めないのが graceMs より続いたら投げる —— 台本の書き損じは、画面の上の赤い文で言う。
 */
export const readingLastGood = (read, graceMs, now = Date.now) => {
  let last;
  let failingSince;
  return () => {
    try {
      last = read();
      failingSince = undefined;
      return last;
    } catch (err) {
      failingSince ??= now();
      if (last !== undefined && now() - failingSince < graceMs) return last;
      throw err;
    }
  };
};

/** /api/changes の回のまとめ (CAPTURE-167)。台本の `changes.runs` をそのまま (新しい順に書いておく)。 */
export const changeRuns = (s) => s.changes?.runs ?? [];

/** /api/crawls/:id/changes (CAPTURE-167)。台本の `changes.details` のその id。無ければ undefined (404)。 */
export const changeDetail = (s, crawlId) => s.changes?.details?.[crawlId];

/**
 * /api/schedules の 1 行。欄は capture-ledger の src/api/schedules.ts と同じ。状態の語 (`health`) の判定は capture-ledger の物なので、
 * 台本に語を書く。時刻は絶対の時刻のまま (画面の絵が撮るたびに変わらないように)。
 */
export const scheduleRow = (c) => ({
  id: c.id,
  name: c.name,
  orgId: c.orgId ?? "acme",
  cron: c.cron,
  timezone: c.timezone ?? "Asia/Tokyo",
  enabled: c.enabled ?? true,
  health: c.health ?? "ok",
  blockedBy: c.blockedBy ?? null,
  nextRunAt: c.nextRunAt,
  runRequestedAt: c.runRequestedAt ?? null,
  seeds: c.seeds ?? [],
  maxDepth: c.maxDepth ?? 0,
  maxPages: c.maxPages ?? 30,
  scripts: c.scripts ?? [],
  outdated: c.outdated ?? false,
  pinnedAt: c.pinnedAt ?? "2026-11-01T00:00:00.000Z",
  createdBy: c.createdBy ?? "sandbox",
  createdAt: c.createdAt ?? "2026-11-01T00:00:00.000Z",
  // capture-ledger は、まだ比べていない回にも change を null で返す (v0.93.0・CAPTURE-167)
  recentRuns: (c.recentRuns ?? []).map((run) => ({ ...run, change: run.change ?? null })),
});

/**
 * 予定の操作。台本は読むだけなので、画面から頼んだ変化は代役が起きている間だけ覚える (id → 上書きする欄)。
 * 作った予定も同じ所に置く。周回は無いので、「いま撮る」は頼みが立つだけで回は増えない。
 */
const scheduleEdits = new Map();
const createdSchedules = [];
const deletedSchedules = new Set();

const schedulesIn = (s) =>
  [...(s.schedules ?? []), ...createdSchedules]
    .filter((row) => !deletedSchedules.has(row.id))
    .map((row) => ({ ...row, ...scheduleEdits.get(row.id) }));

/** `POST /api/schedules`。cron の確かめは capture-ledger の決まりの写しで、欄の数と周期の下限だけを見る。 */
export const createSchedule = (rows, body, now = Date.now()) => {
  if (typeof body?.name !== "string" || body.name.trim() === "") {
    return { status: 400, body: { error: "name must not be blank" } };
  }
  const cron = String(body.cron ?? "").trim();
  if (cron.split(/\s+/).length !== 5) {
    return { status: 400, body: { error: "invalid cron", hint: "cron must have 5 fields" } };
  }
  if (cron.startsWith("*/")) {
    return { status: 400, body: { error: "cron runs too often", gapMinutes: 5, minIntervalMinutes: 60 } };
  }
  if (rows.some((row) => row.name === body.name.trim())) {
    return { status: 409, body: { error: "a schedule with this name already exists" } };
  }
  const row = {
    id: randomUUID(),
    name: body.name.trim(),
    cron,
    seeds: body.request?.seeds ?? [],
    maxDepth: body.request?.maxDepth ?? 2,
    scripts: [],
    nextRunAt: new Date(now + 3_600_000).toISOString(),
    recentRuns: [],
    createdAt: new Date(now).toISOString(),
    pinnedAt: new Date(now).toISOString(),
  };
  return { status: 201, row };
};

/** 台本は要求のたびに読む。書き換えると、代役を起こし直さずに画面に出る。 */
const scenario = readingLastGood(() => JSON.parse(readFileSync(SCENARIO, "utf8")), 3000);

/** workbench の欄から受けた行。代役が起きている間だけ在る (台本には書かない)。 */
const submitted = [];

/** 台本のスクリプトの版の並び。`emptyCatalog` なら空 (スクリプトが無い capture-ledger。読む所には受け皿の型だけが残る)。 */
const versionsIn = (s) => (s.emptyCatalog === true ? [] : catalogOf(s));

/** 台本の Windmill の代わり。edited_at は台本の撮った時刻 (capture-ledger は Windmill の答えの edited_at を写す)。 */
const windmillOf = (s) => ({
  secrets: s.windmillSecrets ?? [],
  variables: s.windmillVariables ?? [],
  editedAt: s.capturedAt,
});

const handle = (req, res, raw) => {
  const { pathname } = new URL(req.url ?? "/", "http://sandbox");
  const s = scenario();
  // IdP の代役。discovery・サインイン (画面を出さずにすぐ戻す)・token endpoint。
  if (req.method === "GET" && pathname === `${SANDBOX_POOL}/.well-known/openid-configuration`) {
    const issuer = `${SANDBOX_ORIGIN}${SANDBOX_POOL}`;
    send(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
    });
    return;
  }
  if (req.method === "GET" && pathname === `${SANDBOX_POOL}/authorize`) {
    const query = new URL(req.url ?? "/", "http://sandbox").searchParams;
    const back = query.get("redirect_uri") ?? "";
    // 戻すのは loopback の workbench にだけ。代役でも、よそへ code を渡す形にはしない。
    if (!back.startsWith("http://127.0.0.1:")) {
      send(res, 400, { error: "redirect_uri は http://127.0.0.1:<ポート>/callback だけ" });
      return;
    }
    const to = new URL(back);
    to.searchParams.set("code", "sandbox-code");
    to.searchParams.set("state", query.get("state") ?? "");
    res.writeHead(302, { location: to.href });
    res.end();
    return;
  }
  if (req.method === "POST" && pathname === `${SANDBOX_POOL}/token`) {
    send(res, 200, {
      access_token: SANDBOX_TOKEN,
      refresh_token: "sandbox-refresh",
      token_type: "Bearer",
    });
    return;
  }
  if (req.method === "POST" && pathname === "/api/crawls") {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(res, 400, { error: "body is not valid JSON" });
      return;
    }
    const answer = submitCrawl(
      submitted,
      body,
      Date.now(),
      s.submit?.runsSeconds ?? 15,
      versionsIn(s),
      windmillOf(s),
      s.captureFormats ?? DEFAULT_FORMATS,
    );
    send(res, answer.status, answer.body);
    return;
  }
  if (req.method === "GET" && pathname === "/api/schedules") {
    send(res, 200, { schedules: schedulesIn(s).map(scheduleRow) });
    return;
  }
  if (req.method === "POST" && pathname === "/api/schedules") {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(res, 400, { error: "body is not valid JSON" });
      return;
    }
    const answer = createSchedule(schedulesIn(s), body);
    if (answer.row === undefined) {
      send(res, answer.status, answer.body);
      return;
    }
    createdSchedules.push(answer.row);
    send(res, answer.status, scheduleRow(answer.row));
    return;
  }
  const acted = /^\/api\/schedules\/([^/]+)\/(pause|resume|run|repin|delete)$/.exec(pathname);
  if (req.method === "POST" && acted !== null) {
    const row = schedulesIn(s).find((one) => one.id === acted[1]);
    if (row === undefined) {
      send(res, 404, { error: "not found" });
      return;
    }
    if (acted[2] === "delete") {
      deletedSchedules.add(row.id);
      send(res, 200, { deleted: true });
      return;
    }
    const edit = {
      pause: { enabled: false, health: "paused" },
      resume: { enabled: true, health: "ok", nextRunAt: new Date(Date.now() + 3_600_000).toISOString() },
      run: { runRequestedAt: new Date().toISOString(), health: "blocked" },
      repin: { outdated: false, scripts: row.scripts?.map((script) => ({ ...script, version: script.latest ?? script.version })) },
    }[acted[2]];
    scheduleEdits.set(row.id, { ...scheduleEdits.get(row.id), ...edit });
    send(res, acted[2] === "run" ? 202 : 200, scheduleRow({ ...row, ...edit }));
    return;
  }
  // 走ったままの行を締める (capture-ledger の /failed と同じ本文)。代役の台本の行は書き換えないので、閉じたとだけ答える
  if (req.method === "POST" && /^\/api\/crawls\/[^/]+\/failed$/.test(pathname)) {
    send(res, 200, { closed: true });
    return;
  }
  if (req.method === "POST" && pathname === "/api/scripts/check") {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(res, 400, { error: "body is not valid JSON" });
      return;
    }
    const answer = checkInline(body);
    send(res, answer.status, answer.body);
    return;
  }
  if (req.method === "GET" && pathname === "/api/crawls") {
    const now = Date.now();
    send(res, 200, {
      crawls: [...submitted.map((row) => submittedRow(row, now)), ...s.crawls.map((c) => crawlRow(c, STARTED))],
    });
    return;
  }
  // その場の TS 1 本（「欄に戻す」のエンドポイント）。受けた行と台本の行のどちらからでも引く
  const back = /^\/api\/crawls\/([^/]+)\/inline\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && back !== null) {
    const mine = submitted.find((row) => row.crawlId === back[1]);
    const scripts = mine?.scripts ?? s.crawls.find((x) => x.crawlId === back[1])?.scripts;
    const answer = inlineSource(scripts, decodeURIComponent(back[2]));
    send(res, answer.status, answer.body);
    return;
  }
  // 前回からの変化 (CAPTURE-167)。台本の changes を、capture-ledger の src/api/changes.ts と同じ形のまま返す
  if (req.method === "GET" && pathname === "/api/changes") {
    send(res, 200, { runs: changeRuns(s) });
    return;
  }
  const changed = /^\/api\/crawls\/([^/]+)\/changes$/.exec(pathname);
  if (req.method === "GET" && changed !== null) {
    const detail = changeDetail(s, changed[1]);
    if (detail === undefined) send(res, 404, { error: "not found" });
    else send(res, 200, detail);
    return;
  }
  // 型の誤りの取り直しと直し方 (CAPTURE-49)。受けた行は型で落ちていないので、取り直しは型を通る答え、直し方は 404
  const diagnosed = /^\/api\/crawls\/([^/]+)\/diagnostics$/.exec(pathname);
  if (req.method === "GET" && diagnosed !== null) {
    const mine = submitted.find((row) => row.crawlId === diagnosed[1]);
    const answer = diagnosticsOf(mine === undefined ? s.crawls.find((x) => x.crawlId === diagnosed[1]) : { crawlId: mine.crawlId });
    send(res, answer.status, answer.body);
    return;
  }
  const fix = /^\/api\/crawls\/([^/]+)\/inline\/([^/]+)\/fix$/.exec(pathname);
  if (req.method === "POST" && fix !== null) {
    const answer = fixOf(s.crawls.find((x) => x.crawlId === fix[1]), decodeURIComponent(fix[2]));
    send(res, answer.status, answer.body);
    return;
  }
  // 規則が何を決めたか (capture-ledger v0.62.0)。受けた行は何も辿っていないので空
  const decided = /^\/api\/crawls\/([^/]+)\/decisions$/.exec(pathname);
  if (req.method === "GET" && decided !== null) {
    const mine = submitted.find((row) => row.crawlId === decided[1]);
    const c = mine ?? s.crawls.find((x) => x.crawlId === decided[1]);
    send(res, c === undefined ? 404 : 200, c === undefined ? { error: "not found" } : decisionsOf(mine === undefined ? c : { crawlId: mine.crawlId }, c.rules));
    return;
  }
  // ページの一覧と 1 ページのログ (CAPTURE-18)。受けた行は何も撮っていないので、一覧は空
  const listed = /^\/api\/crawls\/([^/]+)\/pages$/.exec(pathname);
  const logged = /^\/api\/crawls\/([^/]+)\/pages\/([^/]+)\/log$/.exec(pathname);
  if (req.method === "GET" && (listed !== null || logged !== null)) {
    const crawlId = (listed ?? logged)[1];
    const mine = submitted.find((row) => row.crawlId === crawlId);
    const c = mine === undefined ? s.crawls.find((x) => x.crawlId === crawlId) : { crawlId };
    const answer =
      listed !== null
        ? pageList(c, new URL(req.url ?? "/", "http://sandbox").searchParams)
        : pageLog(c, decodeURIComponent(logged[2]));
    send(res, answer.status, answer.body);
    return;
  }
  if (req.method === "GET" && pathname === "/api/crawl-rules/check") {
    const query = new URL(req.url ?? "/", "http://sandbox").searchParams;
    const answer = crawlRulesCheck(query.getAll("seed"), query.getAll("rule"));
    send(res, answer.status, answer.body);
    return;
  }
  const one = /^\/api\/crawls\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && one !== null) {
    const mine = submitted.find((row) => row.crawlId === one[1]);
    const detail =
      mine === undefined
        ? (() => {
            const c = s.crawls.find((x) => x.crawlId === one[1]);
            return c === undefined ? undefined : crawlDetail(scenarioAt(c, STARTED));
          })()
        : crawlDetail(submittedRow(mine, Date.now()), mine.scripts, mine.rules, {
            variables: mine.variables,
            userAgent: mine.userAgent,
            secrets: mine.secrets,
          });
    send(res, detail === undefined ? 404 : 200, detail ?? { error: "not found" });
    return;
  }
  if (req.method === "GET" && pathname === "/api/archives") {
    send(res, 200, { archives: archiveRows(samples(), s) });
    return;
  }
  if (req.method === "GET" && pathname === "/api/search") {
    const answer = searchOf(samples(), s, new URL(req.url ?? "/", "http://sandbox").searchParams);
    send(res, answer.status, answer.body);
    return;
  }
  if (req.method === "GET" && pathname === "/api/scripts") {
    // 各 id に 1 行、対象サイトと enabled と宣言つきで（capture-ledger v0.64.0。既定で走るのは、enabled の物のうち対象サイトの無い物と起点に合う物）
    send(res, 200, { scripts: scriptRows(versionsIn(s)) });
    return;
  }
  // スクリプトを読むエンドポイント（capture-ledger v0.60.0）。id は % を解いてから引く
  const versions = /^\/api\/scripts\/([^/]+)\/versions(?:\/([^/]+))?$/.exec(pathname);
  if (req.method === "GET" && versions !== null) {
    const id = decodeURIComponent(versions[1]);
    const answer =
      versions[2] === undefined
        ? versionsOf(versionsIn(s), id)
        : versionOf(versionsIn(s), id, versions[2]);
    send(res, answer.status, answer.body);
    return;
  }
  if (req.method === "GET" && pathname === "/api/host-types") {
    const answer = hostTypesOf(s);
    send(res, answer.status, answer.body);
    return;
  }
  const sign = /^\/api\/archives\/([^/]+)\/url$/.exec(pathname);
  if (req.method === "POST" && sign !== null) {
    const signed = signedUrlOf(sign[1], samples());
    send(res, signed === undefined ? 404 : 200, signed ?? { error: "not found" });
    return;
  }
  send(res, 404, { error: "not found" });
};

if (import.meta.main) {
  const port = Number(process.env.SANDBOX_PORT ?? "7070");
  // コンテナの中では外向きに待つ。host へのポートは compose が 127.0.0.1 にだけ出す
  const host = process.env.SANDBOX_HOST ?? "0.0.0.0";
  createServer((req, res) => {
    // 本文を読み切ってから答える (始めるエンドポイントだけが使う。workbench の欄が送る本文は小さい)
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      // 台本の書き損じで代役ごと落とさない。何が読めないかを、画面の上の赤い文で言う
      try {
        handle(req, res, Buffer.concat(chunks).toString("utf8"));
      } catch (err) {
        send(res, 500, { error: `sandbox: ${err instanceof Error ? err.message : String(err)}` });
      }
    });
  }).listen(port, host, () => {
    process.stdout.write(`sandbox-ledger http://${host}:${String(port)}/  WACZ: ${SAMPLES}\n`);
  });
}
