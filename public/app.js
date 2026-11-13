/**
 * workbench。**素の JS**（bundler も framework も通さない）。
 *
 * 読むのは capture-ledger のエンドポイントと、WACZ の中身を読む `/wacz/` のエンドポイントだけ。ここで畳むのは「どの画面を
 * 出すか」と「どう描くか」で、何が起きたかは全部向こうが知っている。
 *
 * **撮った中身は他人が書いたもの。** 文字は `textContent`、画像は raster だけを
 * `<img>` で。生の HTML を差し込む API は使わない。`check` が見張るのは、要素の中身を HTML で書き換える
 * property の名前 1 つ（`public/` の `.js` を語で探す。`package.json` の `check`）だけで、`insertAdjacentHTML` や
 * `outerHTML` のようなほかの API は見ない。
 */
import { applyI18n, dateTime, errorText, key, langOf, phraseText, refusalTexts, switchLang, t, timeOfDay, tNodes } from "/i18n.js";
import { checkVerdict, count, forgetMissing, judgedUnder, linksNoteOf, linksOf, resendOf, secretArchiveOf, severityKind, stateOf, statsOf, took, verdict } from "/format.js";
import {
  ACTIONS,
  actionText,
  addRow,
  addSkipRow,
  askWhenSettled,
  asTemplate,
  bodyBytes,
  checkQuery,
  declaredWith,
  defaultIds,
  hasNocheck,
  INLINE_ROW,
  inlineDeclared,
  keepsKey,
  keyFor,
  liveOrder,
  marksOf,
  movedOrder,
  moveRow,
  onSeed,
  orderOf,
  plainClick,
  PRESETS,
  removeRow,
  seedHosts,
  shownOrder,
  sizeOf,
  startAnswer,
  startBody,
  summaryOf,
  variablesOf,
  withNocheck,
} from "/start.js";
import { dropsOf, inspectHref, ruleTallies } from "/decisions.js";
import {
  actionAnswer,
  bandOf,
  closableCrawl,
  createAnswer,
  createBody,
  cronPresets,
  cronWords,
  healthOf,
  markOf,
  pollMs,
  runDelay,
  runMissed,
  runResult,
  runWhen,
  SCHEDULES_PATH,
  scriptsText,
  shortTime,
  troubleCount,
} from "/schedules.js";
import {
  CHANGES_PATH,
  changeBandLines,
  changeDetailPath,
  changeOf,
  changesError,
  changesHash,
  hunkLines,
  japaneseNote,
  neighborsOf,
  pageClaudeLine,
  parseChangesHash,
  pickPage,
  quoteLineOf,
  runTimeText,
  summaryLine,
  tocOf,
  versionNote,
} from "/changes.js";
import {
  SIZE,
  colX,
  crossOf,
  foldableBelowSeeds,
  foldedAtOpen,
  groupsOf,
  boxLabelOf,
  indexOf,
  layoutOf,
  linksHash,
  linksPath,
  linkOutcomeOf,
  originOf,
  pageKind,
  pageLinksPath,
  parseLinksHash,
  splitOf,
} from "/links.js";
import {
  kindText,
  lengthText,
  NOTES_EAGER,
  applyMetadata,
  axisOf,
  bodyKey,
  consoleOf,
  detailsOf,
  filterRequests,
  hasTrace,
  marksOf as traceMarksOf,
  parseTraceHash,
  percentOf,
  readRecords,
  readsRecords,
  recordPath,
  requestCountsOf,
  requestKindText,
  requestsOf,
  scriptsOf,
  secondsText,
  settleOf,
  snapshotsFromLog,
  sortRequests,
  statusText,
  stepsOf,
  stoppedStepOf,
  tallyOf as traceTallyOf,
  ticksOf,
  timingOf,
  traceHash,
  tracePath,
  traceReasonText,
} from "/timeline.js";
import { diagnosisOf, diffOf, failedOnTypes, fixAnswer, hasErrorsIn, lacksValues, noteText } from "/fix.js";
import {
  awaitsFinalBundle,
  isPartialBundle,
  partialBundleNote,
  replayBundleFailure,
  replayBundleHref,
  replayBundleText,
  VIEWERS,
  viewerText,
  replaywebHref,
} from "/replayweb.js";
import {
  answerOf,
  highlightParts,
  hitReplaywebHref,
  parseSearchHash,
  searchFailure,
  searchHash,
  searchPath,
  stageLabel,
} from "/search.js";
import {
  dataOf,
  droppedOf,
  waczLogTarget,
  FILTERS,
  levelKind,
  linesAt,
  logPath,
  moreOf,
  msOf,
  outcomeOf,
  readPages,
  reasonText,
  rowsOf,
  sourceOf,
  tallyOf,
  toggleLog,
  viewOf,
} from "/pages.js";
import {
  defaultVersionOf,
  labelOf,
  linesOf,
  metaOf,
  optionsText,
  parseReading,
  readingHash,
  standingOf,
  TYPES_HASH,
} from "/reading.js";
import {
  bodyLabel,
  buildTree,
  codecName,
  entryMarker,
  expectedLabel,
  flattenTree,
  formatBytes,
  isWarc,
  lineLabel,
  parseWaczHash,
  recordCells,
  recordOpener,
  typeName,
  waczHash,
  warcinfoNote,
  warcinfoOf,
  warcinfoTag,
} from "/wacz-view.js";

const $ = (id) => document.getElementById(id);

// index.html は字を書かず、鍵（data-i18n）を書く。描く前に、いまの言語の字を入れる
applyI18n();

/** 新しいクロールの画面に、読み直すと消える書きかけが在るか（起点・その場の TS・User-Agent・変数の値・予定の名前）。 */
const startDraft = () =>
  ["start-seeds", "start-inline-source", "start-inline-name", "start-ua-text", "schedule-name"].some(
    (id) => $(id).value.trim() !== "",
  ) || [...document.querySelectorAll("#start-vars input")].some((box) => box.value !== "");

// 言語の切り替え。選びを覚えて頁を読み直すので、書きかけが在れば先に確かめる
for (const b of document.querySelectorAll("#lang button")) {
  const current = b.dataset.lang === langOf();
  b.disabled = current;
  if (current) b.setAttribute("aria-current", "true");
  b.onclick = () => {
    if (startDraft() && !window.confirm(t("common.lang.askDraft"))) return;
    switchLang(b.dataset.lang);
  };
}

/** `/healthz` が配る、この配備の事実。深いリンクの行き先はここから来る。 */
let settings = {};

/**
 * サインインが切れていたら（workbench が 401 と `login` を返す）、サインインの画面へ回る。
 * workbench を起動し直すとセッションは消えるので、開いたままの画面はここを通る。
 */
const signInAgain = (res, body) => {
  if (res.status === 401 && typeof body.login === "string") location.assign(body.login);
};

const api = async (path) => {
  const res = await fetch(path);
  const body = await res.json();
  signInAgain(res, body);
  if (!res.ok) throw new Error(errorText(body) ?? `${path} → ${String(res.status)}`);
  return body;
};

const post = async (path) => {
  const res = await fetch(path, { method: "POST" });
  const body = await res.json();
  signInAgain(res, body);
  if (!res.ok) throw new Error(errorText(body) ?? `${path} → ${String(res.status)}`);
  return body;
};

/**
 * 失敗は**消さずに出す**。capture-ledger が落ちている間も、最後に描けた表は残す ——
 * 空の表は「見えるものが無い」と読めてしまい、「取りに行けない」と区別が付かない。
 */
const trouble = (message) => {
  const box = $("trouble");
  box.hidden = message === undefined;
  if (message !== undefined) box.textContent = message;
};

const tag = (name, text, className) => {
  const el = document.createElement(name);
  el.textContent = text;
  if (className !== undefined) el.className = className;
  return el;
};

const cell = (text, className) => tag("td", text, className);

/** workbench の外への行き先。新しいタブで開く。 */
const link = (href, text) => {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
};

const linkCell = (href, text) => {
  const td = document.createElement("td");
  if (href !== undefined) td.append(link(href, text));
  return td;
};

/** クロールの合本を開く link。途中の版なら、警告の色と説明を付ける（字は呼び手が決める）。 */
const bundleLink = (href, text, crawl) => {
  const a = link(href, text);
  if (isPartialBundle(crawl)) {
    a.classList.add("partial");
    a.title = partialBundleNote();
  }
  return a;
};

/** workbench の中の行き先（hash）。新しいタブで開かない。 */
const hashCell = (href, text) => {
  const td = document.createElement("td");
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  td.append(a);
  return td;
};

const button = (text, onclick) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.onclick = onclick;
  return b;
};

const enc = encodeURIComponent;
const failedText = (err) => (err instanceof Error ? err.message : String(err));
/** 引けなかった物を、Error として持たせる（詳しい所は描き、そこだけ「読めません」と言う）。 */
const asError = (err) => (err instanceof Error ? err : new Error(String(err)));

// ── クロール ───────────────────────────────────────────────────────
let crawls = [];

/**
 * 始めた 1 本か、409 で塞いでいた 1 本。**行は開かずに印を付ける** —— 表は引くたびに
 * 作り直すので、開いた行は次の引きで消える。id で覚えておけば、描き直しのたびに付け直せる。
 */
let spotlight;

const runHref = (crawl) =>
  crawl.lastJob === null
    ? undefined
    : `${settings.windmillOrigin}/run/${crawl.lastJob.id}?workspace=${settings.windmillWorkspace}`;

/**
 * 開いている行。**id で覚え、描き直しのたびに開き直す** —— 表は引くたびに作り直すので、
 * DOM に置いただけの行は次の引きで消える（走行中なら 2 秒で）。値は最後に引いた
 * `/api/crawls/:id` の答え（まだ引いていなければ undefined、引けなければ Error）。
 */
const opened = new Map();

/**
 * 開いた行の「ページ」の表の、引き直しをまたいで覚える物（クロールの id → 続きの件数と、開いたログの箱）。
 * 形は `public/pages.js` の `viewOf`。忘れるのは `opened` と同じ所（行を閉じた時・一覧から消えた時）。
 */
const views = new Map();

/**
 * 直し方を訊いた答え（`fixKey` → 待っている間は `{ asking: true }`、答えが来たら `{ status, body }`）。
 * **行を閉じても忘れない** —— 訊いた答えには Claude を呼んだお金が掛かっている。忘れるのはページを読み直した時だけ。
 */
const fixes = new Map();
const fixKey = (crawlId, name) => `${crawlId} ${name}`;

const failuresText = (one) => {
  const failures = one.failures ?? [];
  return failures.length === 0
    ? t("crawls.detail.noFailures", { seeds: one.seeds.join(", ") })
    : failures.map((f) => `${f.url} — ${f.reason ?? t("crawls.detail.noReason")}`).join("\n");
};

/**
 * 対象サイトの印（サイト用のスクリプトのホスト名）。一覧・見出し・新しいクロールの画面・クロールの詳しい所で同じ形。
 * 後ろの「用」を付けない呼び手（スクリプト集の一覧）は、`suffix` に空の字を渡す。
 */
const siteChip = (sites, suffix) => {
  const list = sites.join(t("common.sep.dot"));
  return tag("span", suffix === "" ? list : t("common.site.for", { sites: list }), "site");
};

/** 差分の箱。**DOM で組む**（public/ では HTML を差し込まない）。消した行と足した行を、行番号と印で並べる。 */
const diffBoxOf = (edits) => {
  const box = document.createElement("div");
  box.className = "diff";
  for (const hunk of diffOf(edits)) {
    box.append(tag("p", hunk.title, "muted"));
    const lines = document.createElement("table");
    lines.className = "difflines";
    for (const line of hunk.lines) {
      const row = document.createElement("tr");
      row.className = line.sign === "-" ? "del" : "add";
      row.append(cell(String(line.no), "num mono"), cell(line.sign, "mono"), cell(line.text, "mono code"));
      lines.append(row);
    }
    box.append(lines);
  }
  return box;
};

/**
 * 「直し方を訊く」と、訊いた答え。**押したときだけ Claude を呼ぶ**（型の誤りの表は呼ばずに出る）。capture-ledger が返すのは
 * 型の検査に通った直しだけで、理由・差分・回数と費用を出し、「直した版を欄に戻す」で新しいクロールの画面へ渡す。
 */
const fixOf = (crawlId, script) => {
  const name = script.inline.name;
  const state = fixes.get(fixKey(crawlId, name));
  const asking = state?.asking === true;
  const ask = button(
    asking ? t("crawls.fix.asking") : state === undefined ? t("crawls.fix.ask") : t("crawls.fix.askAgain"),
    () => void askFix(crawlId, name),
  );
  ask.disabled = asking;
  if (state === undefined || asking) return [ask];
  const said = fixAnswer(state.status, state.body);
  const box = document.createElement("div");
  box.className = "fix";
  box.append(tag("p", said.text, `state ${said.kind}`));
  if (state.status === 200 && typeof state.body.source === "string") {
    const notes = document.createElement("ul");
    for (const note of state.body.notes ?? []) notes.append(tag("li", noteText(note)));
    const back = document.createElement("p");
    back.append(
      button(t("crawls.fix.apply"), () => intoForm(name, script.phase, state.body.source)),
      tag("span", t("crawls.fix.onlyTypes"), "muted"),
    );
    box.append(notes, diffBoxOf(state.body.edits), back);
  } else {
    // 案を断った理由。capture-ledger が組（`refusalHints`）を返せば訳し、無ければ届いた文（`refusals`）のまま
    const refusals = refusalTexts(state.body);
    if (refusals.length > 0) {
      box.append(tag("p", t("crawls.fix.refusals", { list: refusals.join(t("common.sep.slash")) }), "muted"));
    }
  }
  return [ask, box];
};

/**
 * 直し方を訊く。本文は `{}` の JSON —— 書き込みのエンドポイントの門は JSON だけを受ける（`post()` は content-type を付けないので
 * 使わない。`startCrawl` と同じ fetch の形）。答えは `fixes` に覚え、その行だけを描き直す。
 */
const askFix = async (crawlId, name) => {
  const key = fixKey(crawlId, name);
  fixes.set(key, { asking: true });
  redrawDetail(crawlId);
  let status = 0;
  let body = {};
  try {
    const res = await fetch(`/api/crawls/${crawlId}/inline/${enc(name)}/fix`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (err) {
    body = { error: failedText(err) };
  }
  fixes.set(key, { status, body });
  redrawDetail(crawlId);
};

/**
 * 走らせたもの。**並びが実行順。** 登録済みのスクリプトは版を、その場で書いた物は「その場」と出す ——
 * その場の物にだけ、capture-ledger は頼まれた要素（`inline`）を返す。サイト用のスクリプトには対象サイトを添える。
 */
const ranOf = (one) => {
  const scripts = one.scripts ?? [];
  if (scripts.length === 0) return tag("p", t("crawls.detail.ranNone"));
  const list = document.createElement("ol");
  list.className = "ran";
  for (const script of scripts) {
    const item = document.createElement("li");
    const where =
      script.inline === undefined
        ? t("crawls.detail.registered", { version: script.version, phase: script.phase })
        : t("crawls.detail.inline", { phase: script.phase, n: script.inline.bytes });
    item.append(tag("span", script.id, "mono"));
    if (script.sites.length > 0) item.append(siteChip(script.sites));
    item.append(tag("span", where, "muted"));
    // その場の TS は、直して撮り直せるように欄へ戻せる（登録済みのスクリプトは capture-ledger に在る）。source は詳しい所に
    // 無いので、押したときに名前で引くエンドポイントから取る
    if (script.inline !== undefined) {
      item.append(button(t("crawls.detail.backToForm"), () => void putBack(one.crawlId, script.inline.name)));
      // 型の誤りの在るその場の TS には、直し方を訊く道も（押したときだけ Claude を呼ぶ）
      if (hasErrorsIn(one.diagnosed, script.id)) item.append(...fixOf(one.crawlId, script));
    } else {
      // 走った版を読む。番号は使い回されうるので sha256 の頭も渡し、読む所が食い違いを言う
      const read = tag("a", t("crawls.detail.read"));
      read.href = readingHash({ id: script.id, version: script.version, sha: script.sha256.slice(0, 12) });
      item.append(read);
    }
    list.append(item);
  }
  const box = document.createElement("div");
  box.append(tag("p", t("crawls.detail.ran")), list);
  return box;
};

/** 時刻を読める形に。読めない文字列（capture-ledger が null を返した所など）はそのまま。 */
const whenOf = (iso) => {
  const ms = Date.parse(String(iso));
  return Number.isNaN(ms) ? String(iso) : dateTime(new Date(ms));
};

/**
 * シークレットの値を WARC に残すかの印（`format.js` の `secretArchiveOf`）。開いた行と新しいクロールの画面が同じ物を
 * 出す。capture-ledger が言わなければ undefined。
 */
const archiveTag = (archive) => {
  const said = secretArchiveOf(archive);
  if (said === undefined) return undefined;
  const span = tag("span", said.text, said.kind === "muted" ? "muted" : `state ${said.kind}`);
  if (said.title !== undefined) span.title = said.title;
  return span;
};

/**
 * 渡した値（capture-ledger の `variables`。始めるときに行へ固定された名前と値）と、使ったシークレット（`secrets`。名前と
 * Windmill の変数の path と、capture-ledger が確かめたときの edited_at。途中で替わっていれば、どの段からか。WARC に残すか）。
 * **値を持つのは変数だけ** —— シークレットの値は capture-ledger に無く、写し・ページの文字・ログからも消える。WARC では、隠す
 * シークレットの値は `***` に置き換わり、`keep` と宣言した物は値のまま残る（`format.js` の `secretArchiveOf`）。
 * どちらも持たない capture-ledger（v0.66 まで）の行は何も出さない。
 */
const valuesOf = (one) => {
  const box = document.createElement("div");
  box.className = "values";
  if (one.variables === undefined && one.secrets === undefined) return box;
  // 打った字のまま。解いた字は WACZ の settings.userAgent に在る
  box.append(
    typeof one.userAgent === "string"
      ? tag("p", `User-Agent: ${one.userAgent}`)
      : tag("p", t("crawls.detail.uaDefault"), "muted"),
  );
  const vars = Object.entries(one.variables ?? {});
  const secrets = one.secrets ?? [];
  if (vars.length === 0 && secrets.length === 0) {
    box.append(tag("p", t("crawls.detail.valuesNone"), "muted"));
    return box;
  }
  if (vars.length > 0) {
    box.append(tag("p", t("crawls.detail.values")));
    const table = document.createElement("table");
    table.className = "vals";
    for (const [name, value] of vars) {
      const row = document.createElement("tr");
      row.append(cell(name, "mono"), cell(String(value), "pre"));
      table.append(row);
    }
    box.append(table);
  }
  if (secrets.length > 0) {
    box.append(tag("p", t("crawls.detail.secrets")));
    const list = document.createElement("ul");
    list.className = "secrets";
    for (const secret of secrets) {
      const item = document.createElement("li");
      item.append(tag("span", String(secret.name), "mono"), tag("span", String(secret.path), "mono muted"));
      item.append(tag("span", `edited_at ${whenOf(secret.editedAt)}`, "muted"));
      if (secret.rotated !== null && secret.rotated !== undefined) {
        item.append(
          tag(
            "span",
            t("crawls.detail.secretRotated", { depth: secret.rotated.depth, when: whenOf(secret.rotated.editedAt) }),
            "state warn",
          ),
        );
      }
      const archive = archiveTag(secret.archive);
      if (archive !== undefined) item.append(archive);
      list.append(item);
    }
    box.append(list);
  }
  return box;
};

/** 開いた行から、そのクロールのリンクの構成（`#links/<クロールの id>`・CAPTURE-246）へ。 */
const linksLineOf = (one) => {
  const line = document.createElement("p");
  line.className = "links-line";
  const toLinks = (text) => {
    const a = tag("a", text);
    a.href = linksHash(one.crawlId);
    return a;
  };
  line.append(...tNodes("crawls.detail.linksLine", { a: toLinks }));
  return line;
};

/**
 * 規則が何を決めたか（capture-ledger の `GET /api/crawls/:id/decisions`）。規則ごとの数（段を跨いで足し、0 回の規則に
 * 印）と、落とした物（規則・どれにも当たらない・robots.txt、ホスト名ごと）、その下に Windmill で調べる 1 行。
 * **決めたリンクが 1 本も無ければ数を並べない** —— リンクの無いページでも全部の規則に「当たって
 * いません」が付き、読み違える。読めなければ 1 行で言う（capture-ledger が古ければエンドポイントが無い）。
 */
const decisionsOf = (one) => {
  const box = document.createElement("div");
  box.className = "decided";
  const decided = one.decided;
  if (decided === undefined) return box;
  if (decided instanceof Error) {
    box.append(tag("p", t("crawls.decided.unreadable", { said: decided.message }), "muted"));
    return box;
  }
  if (decided.decisions.length === 0) {
    box.append(tag("p", t("crawls.decided.none"), "muted"));
  } else {
    // 段の中では別々の URL だが、段を跨ぐと同じ URL を 2 度数える（延べ）。別々の URL での内訳は、リンクの構成の画面
    box.append(tag("p", t("crawls.decided.perRule")));
    const list = document.createElement("ol");
    list.className = "tally";
    for (const tally of ruleTallies(decided.rules, decided.decisions)) {
      const item = document.createElement("li");
      item.append(
        tag(
          "span",
          tally.rule === 0
            ? t("crawls.decided.noRule")
            : `${String(tally.rule)}. ${actionText(tally.action)}`,
        ),
        tag("span", tally.pattern, "mono"),
        tag("span", t("crawls.decided.urls", { n: tally.links }), "num mono"),
      );
      if (tally.rule !== 0 && tally.links === 0) item.append(tag("span", t("crawls.decided.neverMatched"), "state warn"));
      list.append(item);
    }
    box.append(list);
  }
  const drops = dropsOf(decided.decisions, decided.robots);
  if (drops.length > 0) {
    box.append(tag("p", t("crawls.decided.dropped")));
    const table = document.createElement("table");
    table.className = "drops";
    for (const d of drops) {
      const row = document.createElement("tr");
      row.append(
        cell(
          d.why === "robots"
            ? "robots.txt"
            : d.why === 0
              ? t("crawls.decided.dropNoRule")
              : t("crawls.decided.dropRule", { rule: d.why }),
        ),
        cell(d.hostname, "mono"),
        cell(t("crawls.decided.urls", { n: d.links }), "num mono"),
        cell(d.sample, "mono muted"),
      );
      table.append(row);
    }
    box.append(table);
  }
  const line = document.createElement("p");
  const inspect = (text) => {
    const a = tag("a", text, "mono");
    a.href = inspectHref(settings.windmillOrigin, settings.windmillWorkspace, one.crawlId);
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  };
  line.append(
    ...tNodes("crawls.decided.inspect", { a: inspect, path: "f/waggle/inspect_crawl", crawl: one.crawlId.slice(0, 8) }),
  );
  box.append(line);
  return box;
};

/** 数の欄（warn か error）。0 より大きければ色を付け、数を読んでいなければ「—」を薄く。 */
const tallyCell = (counts, level) => {
  const { text, kind } = tallyOf(counts, level);
  return cell(text, kind === undefined ? "num mono" : kind === "muted" ? "num mono muted" : `num mono state ${kind}`);
};

/**
 * 1 ページのログの箱の中身。答えが来たときと、絞り込みを替えたときに描く（箱そのものは作り直さない）。行は
 * capture-ledger の並びのまま、文（msg）は言い換えず、data は JSON のまま文の後ろに続ける（欄を分けると、狭い箱で data が
 * 数字ずつに折れた）。どちらも textContent で入れる。途中で切った行の印は文の前に（長い行は箱の下に隠れる）。
 */
const drawLog = (state) => {
  const { answer, box } = state;
  if (answer === undefined) {
    box.replaceChildren(tag("p", t("common.loading"), "muted"));
    return;
  }
  if (answer instanceof Error) {
    box.replaceChildren(tag("p", t("crawls.log.unreadableSaid", { said: answer.message }), "state bad"));
    return;
  }
  if (answer.log === null || answer.log === undefined) {
    const said = tag("p", `${reasonText(answer.reason)} `, "muted");
    said.append(tag("span", String(answer.reason), "mono"));
    box.replaceChildren(said);
    return;
  }
  const { lines, dropped } = answer.log;
  const bar = document.createElement("div");
  bar.className = "chips";
  for (const [id, label] of FILTERS) {
    const chip = button(label(count(linesAt(lines, id).length)), () => {
      state.filter = id;
      state.scrollTop = 0;
      drawLog(state);
    });
    chip.className = state.filter === id ? "chip on" : "chip";
    bar.append(chip);
  }
  const lost = droppedOf(dropped);
  if (lost !== undefined) bar.append(tag("span", lost, "state warn"));
  // WACZ に封じた同じ行（profile を除けば答えの行と同じ）を、WACZ の画面で開く。同じタブで（hash の行き先）
  const sealed = waczLogTarget(answer.page);
  if (sealed !== undefined) {
    const a = document.createElement("a");
    a.href = waczHash(sealed.archiveId, sealed.path);
    a.textContent = t("crawls.log.openInWacz");
    a.title = t("crawls.log.openInWaczTitle", { path: sealed.path });
    bar.append(a);
  }
  const shown = linesAt(lines, state.filter);
  if (shown.length === 0) {
    box.replaceChildren(
      bar,
      tag("p", lines.length === 0 ? t("crawls.log.noLines") : t("crawls.log.noLinesInFilter"), "muted"),
    );
    return;
  }
  const table = document.createElement("table");
  table.className = "loglines";
  for (const line of shown) {
    const row = document.createElement("tr");
    const level = document.createElement("td");
    level.append(tag("span", String(line.level), `lv ${levelKind(line.level)}`));
    const msg = document.createElement("td");
    msg.className = "msg";
    if (line.truncated === true) msg.append(tag("span", t("crawls.log.cut"), "cut"));
    msg.append(String(line.msg));
    const data = dataOf(line);
    if (data !== "") msg.append(" ", tag("span", data, "data"));
    row.append(cell(msOf(line), "num mono"), cell(sourceOf(line), "mono"), level, msg);
    table.append(row);
  }
  // 流した位置は覚えておき、箱を移した後に戻す（DOM から外すと 0 に戻る）
  const scroller = document.createElement("div");
  scroller.className = "logscroll";
  scroller.addEventListener("scroll", () => {
    state.scrollTop = scroller.scrollTop;
  });
  scroller.append(table);
  box.replaceChildren(bar, scroller);
};

/** 箱の状態に、DOM の箱を 1 度だけ作る。後の描き直しでは、この箱を移す。 */
const logBoxOf = (state) => {
  if (state.box === undefined) {
    state.box = document.createElement("div");
    state.box.className = "logbox";
    drawLog(state);
  }
  return state.box;
};

/** 1 ページのログを引き、箱に描く。**押したときに 1 度だけ引く**（閉じて開き直せば、また引く）。 */
const loadLog = async (crawlId, pageId, state) => {
  try {
    state.answer = await api(logPath(crawlId, pageId));
  } catch (err) {
    state.answer = asError(err);
  }
  if (state.box !== undefined) drawLog(state);
};

/** 移した箱の流した位置を戻す。描いた行を表に置いた後に呼ぶ。 */
const restoreScroll = () => {
  for (const view of views.values()) {
    for (const state of view.logs.values()) {
      const scroller = state.box?.querySelector(".logscroll");
      if (scroller?.isConnected === true && scroller.scrollTop !== state.scrollTop) scroller.scrollTop = state.scrollTop;
    }
  }
};

/**
 * ページ（capture-ledger の `GET /api/crawls/:id/pages`。詳しい所と一緒に引く）。capture-ledger に入った順に、URL・結末・warn と
 * error の数・ログの button。並べるのは capture-ledger の 1 回分で、続きは「続きを読む」を押したときだけ引く。ログは押した
 * ときに引き、その行の下の箱に出す。**開いた箱は id で覚え、作り直さずに移す** —— 表は引くたびに作り直すので、
 * 作り直すと流した位置と絞り込みが消える。読めなければ 1 行で言う（capture-ledger が古ければエンドポイントが無い）。
 *
 * 結末の後ろの再生の link は、そのページをクロールの合本の中で開く。合本は詳しい所（`/api/crawls/:id`。ページと
 * 一緒に引く）が指す版で、ページの WACZ がその版に入っている行にだけ出す（`public/replayweb.js` の `replayBundleHref`。
 * 2 つを引く間に capture-ledger が次の版を書いても、指す版に無いページを開かせない）。**列は足さない** —— 出るのはふつう
 * 撮れたページ（結末が `captured` の 1 語）で、結末の列の幅の中に収まる。列を足すと表が広がり、docs の画面の絵
 * （本文の幅）に収まらなかった（2026-11-05 に測った）。同じ理由で、途中の版でも字は増やさず、色と説明だけを付ける。
 */
const pagesOf = (one) => {
  const box = document.createElement("div");
  box.className = "pages";
  const list = one.pages;
  if (list === undefined) return box;
  if (list instanceof Error) {
    box.append(tag("p", t("crawls.pages.unreadable", { said: list.message }), "muted"));
    return box;
  }
  if (list.pages.length === 0) {
    box.append(tag("p", t("crawls.pages.none"), "muted"));
    return box;
  }
  box.append(tag("p", t("crawls.pages.title")));
  const table = document.createElement("table");
  table.className = "pagelist";
  const head = document.createElement("tr");
  head.append(
    tag("th", "URL"),
    tag("th", t("crawls.pages.colOutcome")),
    tag("th", "warn", "num"),
    tag("th", "error", "num"),
    tag("th", t("crawls.pages.colLog")),
  );
  table.append(head);
  for (const { page, log } of rowsOf(views, one.crawlId, list)) {
    const row = document.createElement("tr");
    const url = document.createElement("td");
    url.append(tag("span", String(page.url), "mono url"));
    const outcome = document.createElement("td");
    const said = tag("span", outcomeOf(page, one.state), "outcome");
    for (const viewer of VIEWERS) {
      const replay = replayBundleHref(settings[viewer.setting], one.replayBundle, page);
      if (replay !== undefined) said.append(" ", bundleLink(replay, viewerText(viewer), one));
    }
    // 取り込みの答えが在るページ（撮れた・取れなかった）には、経緯（#trace/…）への link。列は足さない
    if (page.taskId !== null && page.taskId !== undefined) {
      const trace = document.createElement("a");
      trace.href = traceHash(one.crawlId, page.id);
      trace.textContent = t("crawls.pages.trace");
      trace.className = "trace-link";
      said.append(" ", trace);
    }
    outcome.append(said);
    const toggle = document.createElement("td");
    toggle.append(
      button(log === undefined ? t("crawls.pages.logOpen") : t("crawls.pages.logClose"), () => toggleOne(one.crawlId, page.id)),
    );
    row.append(url, outcome, tallyCell(page.logCounts, "warn"), tallyCell(page.logCounts, "error"), toggle);
    table.append(row);
    if (log === undefined) continue;
    const under = document.createElement("tr");
    under.className = "logrow";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.append(logBoxOf(log));
    under.append(td);
    table.append(under);
  }
  box.append(table);
  const more = moreOf(list);
  if (more !== undefined) {
    const next = button(more.label, () => {
      next.disabled = true;
      next.textContent = t("common.loading");
      viewOf(views, one.crawlId).want = more.want;
      void loadDetail(one.crawlId);
    });
    box.append(next);
  }
  return box;
};

/**
 * 取り直した型の誤り（`GET /api/crawls/:id/diagnostics`）。**Claude は呼ばずに出る** —— 行の失敗の文は capture-ledger の
 * 上限で切られ、最初の数件しか無い。ここには全部が、スクリプト・行と列つきで並ぶ。
 */
const typeErrorsOf = (one) => {
  const said = one.diagnosed;
  if (said === undefined) return [];
  if (said.kind === "trouble") return [tag("p", t("crawls.diag.trouble", { said: said.text }), "state bad")];
  if (said.kind === "clean") {
    return [tag("p", t("crawls.diag.clean", { typescript: said.typescript }), "muted")];
  }
  const table = document.createElement("table");
  table.className = "typeerrors";
  const head = document.createElement("tr");
  head.append(
    tag("th", t("crawls.diag.colScript")),
    tag("th", t("crawls.diag.colAt")),
    tag("th", t("crawls.diag.colCode")),
    tag("th", t("crawls.diag.colMessage")),
  );
  table.append(head);
  for (const row of said.rows) {
    const tr = document.createElement("tr");
    tr.append(cell(row.where, "mono"), cell(row.at, "mono"), cell(row.code, "mono"), cell(row.message));
    table.append(tr);
  }
  const box = document.createElement("div");
  box.append(
    tag("p", t("crawls.diag.title", { typescript: said.typescript, n: said.rows.length })),
    table,
    ...(lacksValues(said) ? [tag("p", t("crawls.diag.lacksValues"), "state warn")] : []),
  );
  return [box];
};

/**
 * 型の検査で落ちた行なら、誤りを取り直す（Claude は呼ばない）。**取り直せた答えは使い回す** —— 行に固定した
 * 組み合わせは変わらないので、ページの続きを読むたびに ts-compile-service を呼ばない。取り直せなかった答えは、
 * 行を開き直したときにもう 1 度訊く。
 */
const diagnosedOf = async (crawlId, detail) => {
  if (!failedOnTypes(detail.error)) return undefined;
  const before = opened.get(crawlId);
  const kept = before instanceof Error ? undefined : before?.diagnosed;
  if (kept !== undefined && kept.kind !== "trouble") return kept;
  try {
    const res = await fetch(`/api/crawls/${crawlId}/diagnostics`);
    return diagnosisOf(res.status, await res.json().catch(() => ({})));
  } catch (err) {
    return diagnosisOf(0, { error: failedText(err) });
  }
};

/**
 * 1 本の詳しい所。**失敗の文が先** —— compile の段で落ちたクロールは 1 枚も撮っていないので
 * failures が空で、それだけを出すと「取れなかったページはありません」と、成功のように読める。
 * 次が合本を書けなかった理由。合本はクロールを止めない派生物なので warn の色で、再生の link が無い（前の版を開く）
 * 訳をここで言う。capture-ledger の文は言い換えない。
 */
const detailOf = (one) => {
  const bundleFailure = replayBundleFailure(one.replayBundle);
  // 段を Windmill に送り直した様子（CAPTURE-180）。諦めて締めた段なら、失敗の文の前に出す（失敗の理由の元がこれ）
  const resend = resendOf(one.dispatch);
  return [
    ...(resend === undefined
      ? []
      : [
          tag(
            "p",
            resend.error === null ? resend.text : t("crawls.resend.withError", { resend: resend.text, error: resend.error }),
            `state ${resend.kind} pre`,
          ),
        ]),
    ...(one.error === null || one.error === undefined
      ? []
      : [tag("p", t("crawls.detail.error", { error: phraseText("crawls.reason", one.error) }), "state bad pre")]),
    ...(bundleFailure === undefined ? [] : [tag("p", bundleFailure, "state warn pre")]),
    ...typeErrorsOf(one),
    ranOf(one),
    valuesOf(one),
    decisionsOf(one),
    linksLineOf(one),
    pagesOf(one),
    tag("p", failuresText(one), "pre"),
  ];
};

/** 開いた行の下に出す 1 行。最後の答えで、引き直しを待たずに描く。 */
const detailRow = (crawl) => {
  const row = document.createElement("tr");
  row.className = "detail";
  row.dataset.crawl = crawl.crawlId;
  const td = document.createElement("td");
  td.colSpan = 9;
  const one = opened.get(crawl.crawlId);
  if (one === undefined) td.textContent = t("common.loading");
  else if (one instanceof Error) td.replaceChildren(tag("p", failedText(one), "state bad"));
  else td.replaceChildren(...detailOf(one));
  row.append(td);
  return row;
};

/** 開いた行を、覚えた答えで描き直す（その行だけ）。移したログの箱は、流した位置も戻す。 */
const redrawDetail = (crawlId) => {
  const crawl = crawls.find((c) => c.crawlId === crawlId);
  const row = document.querySelector(`tr.detail[data-crawl="${CSS.escape(crawlId)}"]`);
  if (crawl !== undefined && row !== null) row.replaceWith(detailRow(crawl));
  restoreScroll();
};

/** ページのログの箱を開け閉めし、開いたなら引く。 */
const toggleOne = (crawlId, pageId) => {
  const state = toggleLog(views, crawlId, pageId);
  if (state !== undefined) void loadLog(crawlId, pageId, state);
  redrawDetail(crawlId);
};

/**
 * 1 本を引いて覚え、その行だけを描き直す。**開いたときと、変わりうるときだけ引く。** 規則の判断とページの
 * 一覧も同時に引き、答えに `decided`・`pages` として持たせる（引けなければ Error。詳しい所は描く）。
 * ページは「続きを読む」で読んだ所まで覆い直す。
 */
const loadDetail = async (crawlId) => {
  let one;
  try {
    const [detail, decided, pages] = await Promise.all([
      api(`/api/crawls/${crawlId}`),
      api(`/api/crawls/${crawlId}/decisions`).catch(asError),
      readPages(api, crawlId, views.get(crawlId)?.want ?? 0).catch(asError),
    ]);
    one = { ...detail, decided, pages, diagnosed: await diagnosedOf(crawlId, detail) };
  } catch (err) {
    one = asError(err);
  }
  if (!opened.has(crawlId)) return; // 待っている間に閉じた
  opened.set(crawlId, one);
  redrawDetail(crawlId);
};

/**
 * 引き直しの後、開いている行の答えを新しくする。**引くのは、まだ答えが無い・引けなかった・
 * 走行中・状態が変わった行だけ** —— 終わった行は 1 度で足りる。1 ページ目から外れた行は忘れる。
 */
const refreshOpened = () => {
  for (const [crawlId, one] of opened) {
    const crawl = crawls.find((c) => c.crawlId === crawlId);
    if (crawl === undefined) {
      opened.delete(crawlId);
      views.delete(crawlId);
      continue;
    }
    const stale =
      one === undefined ||
      one instanceof Error ||
      crawl.state === "running" ||
      one.state !== crawl.state;
    if (stale) void loadDetail(crawlId);
  }
};

const drawCrawls = () => {
  const body = $("crawls");
  body.replaceChildren();
  $("crawls-empty").hidden = crawls.length > 0;
  for (const crawl of crawls) {
    const state = stateOf(crawl);
    const row = document.createElement("tr");
    row.className = crawl.crawlId === spotlight ? "head spot" : "head";
    const stateCell = cell(state.text, `state ${state.kind}`);
    // 段を Windmill に送り直したら、状態の隣に言う。最後の誤りは印の title（開けば文で出る）
    const resend = resendOf(crawl.dispatch);
    if (resend !== undefined) {
      const badge = tag("span", resend.text, `resend-mark ${resend.kind}`);
      if (resend.error !== null) badge.title = resend.error;
      stateCell.append(" ", badge);
    }
    row.append(stateCell);
    row.append(cell(crawl.crawlId.slice(0, 8), "mono"));
    const who = cell(`${crawl.requestedBy} / ${crawl.orgId}`);
    const mark = markOf(crawl);
    if (mark !== undefined) {
      const badge = tag("span", mark.text, "schedule-mark");
      badge.title = mark.title;
      who.append(" ", badge);
    }
    row.append(who);
    row.append(cell(crawl.seeds[0] ?? "", "wide"));
    // **2 つの数を 1 つの欄に混ぜない。** リンクの数は撮れた数の分母ではない（`linksOf`）
    row.append(cell(String(crawl.pagesCaptured), "num mono"));
    // 数を押すと、リンクの構成（#links/<クロールの id>）。1 枚も撮れていない行（−）は link にしない
    const links = crawl.pagesCaptured === 0 ? cell(linksOf(crawl), "num mono") : hashCell(linksHash(crawl.crawlId), linksOf(crawl));
    links.className = "num mono";
    const note = linksNoteOf(crawl);
    if (note !== undefined) {
      links.classList.add("muted");
      links.title = note;
    }
    row.append(links);
    row.append(cell(String(crawl.waczCount), "num mono"));
    row.append(cell(took(crawl), "num mono"));
    // 行き先: run と、capture-ledger が合本を書けていれば、クロールを 1 つのアーカイブとして replayweb-server で。**run ↗ が先頭**
    // （docs の画面の絵の印が、この欄の先頭の link を指す）
    const go = linkCell(runHref(crawl), "run ↗");
    for (const viewer of VIEWERS) {
      const replay = replayBundleHref(settings[viewer.setting], crawl.replayBundle);
      if (replay !== undefined) go.append(bundleLink(replay, replayBundleText(crawl, viewer), crawl));
    }
    row.append(go);
    row.onclick = (event) => {
      if (event.target instanceof HTMLAnchorElement) return;
      if (opened.delete(crawl.crawlId)) {
        views.delete(crawl.crawlId);
        if (row.nextElementSibling?.classList.contains("detail")) row.nextElementSibling.remove();
        return;
      }
      opened.set(crawl.crawlId, undefined);
      row.after(detailRow(crawl));
      void loadDetail(crawl.crawlId);
    };
    body.append(row);
    // 開いていた行は、最後の答えで開き直す（表は引くたびに作り直す）
    if (opened.has(crawl.crawlId)) body.append(detailRow(crawl));
  }
  restoreScroll();
};

// ── 新しいクロール ─────────────────────────────────────────────────
/**
 * 描いたスクリプトの行（スクリプト集の画面と同じ、capture-ledger の並び。対象サイトの無い物もサイト用の物も）。宣言した値の欄はこの並びで
 * 出す —— ↑↓ で行を動かしても、打っている変数の欄は動かない。画面の行と送る物の順は `moved` から決まる（`orderOf`）。
 * `why` はサイト用のスクリプトにだけ在る、押せない理由の欄。
 */
let picks = [];

/**
 * 人が ↑↓ で動かした走る順（`start.js` の `orderOf`）。動かすまでは undefined で、capture-ledger の並びに付いていく。
 * チェック（`chosen`）と同じく、**引き直しても、始めた後も覚えておく**。
 */
let moved;

/**
 * 走る順の 1 行（番号・中身・↑↓）の部品。↑↓ の後のフォーカスは辿り方の表と同じ —— 同じボタン、端に着いて押せなく
 * なったら反対向きのボタン。行を DOM の中で動かすとフォーカスが外れるので、毎回付け直す。
 * `labels` は ↑↓ の読み上げの文（`{ up, down }`。何を移すかを言う）。
 */
const runRow = (id, labels, body) => {
  const no = tag("span", "", "pick-no");
  const moves = tag("span", "", "pick-moves");
  const arrow = (text, delta, label) => {
    const b = button(text, () => {
      moved = movedOrder(runOf(), id, delta);
      syncStart();
      (b.disabled ? moves.querySelector("button:enabled") : b)?.focus();
    });
    b.setAttribute("aria-label", label);
    moves.append(b);
    return b;
  };
  const up = arrow("↑", -1, labels.up);
  const down = arrow("↓", 1, labels.down);
  const el = tag("div", "", "pick-row");
  el.append(no, body, moves);
  return { id, el, no, moves, up, down };
};

/**
 * その場の TS の行。読み込みの後に走る物を書いたときだけ出す（`drawRunOrder`）。チェックは無い —— 書いてあれば走る。
 * 最初に要るときに 1 度だけ作る（字を引くのは、読み込みの後）。
 */
let inlineRowMade;
const inlineRow = () =>
  (inlineRowMade ??= runRow(
    INLINE_ROW,
    { up: t("start.scripts.inlineUp"), down: t("start.scripts.inlineDown") },
    tag("span", t("start.tab.inline"), "pick"),
  ));

/**
 * 人が付け外ししたチェック（id → 付けたか）。**引き直しても覚えておく。** 覚えていない id は、capture-ledger の既定
 * （`enabled`）のとおりに出る —— 既定に入る物は付いた状態で、入らない物（autofetch など）は外れた状態で。
 */
const chosen = new Map();

/** そのスクリプトを走らせるか。人が付け外ししていれば、それに従う。 */
const pickedOf = (script) => chosen.get(script.id) ?? script.enabled;

/**
 * 人が打ったクロールごとの変数の値（名前 → 文字列）。**描き直しと、202 の後の起点の消去をまたいで残す** —— 同じ語で
 * 撮り直すことが多い。チェックを外して宣言から外れた名前の値も残り、付け直せば欄に戻る。送るのは宣言された名前だけ
 * （`start.js` の `variablesOf`）。
 */
const values = new Map();

/** 最後に描いたチェックの形（id と版と対象サイトと、既定に入るか、宣言した値）。同じなら描き直さない。 */
let catalogKey;

/**
 * スクリプトのチェックを描く。**登録済みのスクリプトが変わったときだけ描き直す** —— 一覧は走行中なら 2 秒ごとに
 * 引くので、毎回作り直すと、押そうとしているチェックが手の下で入れ替わる。付け外しは `syncPicks`。
 */
const drawPicks = (scripts) => {
  // 宣言した値（params）も鍵に入れる —— 版が同じでも宣言が変われば、値の欄を描き直す
  const key = scripts
    .map((s) => `${s.id}@${String(s.version)}~${s.sites.join(" ")}~${String(s.enabled)}~${JSON.stringify(s.params ?? [])}`)
    .join(",");
  if (key === catalogKey) return;
  catalogKey = key;
  const box = $("start-picks");
  box.replaceChildren();
  picks = [];
  for (const script of scripts) {
    const input = document.createElement("input");
    input.type = "checkbox";
    // 値の欄と番号は change で合わせる。input は change より先に出るので、そこで checked を読むと 1 つ遅れる
    input.onchange = () => {
      chosen.set(script.id, input.checked);
      drawValues();
      syncStart();
    };
    const label = document.createElement("label");
    label.className = "pick";
    const name = tag("span", `${script.id} v${String(script.version)}`, "mono");
    // 中身を読む。ふつうに押せば右の列でこの版を開き、修飾キーならスクリプト集の画面を別のタブで（data-read の
    // click）。label の中の <a> は、押してもチェックを替えない —— 押せないチェックの横でも読める
    const read = tag("a", t("start.scripts.read"), "read");
    read.href = readingHash({ id: script.id, version: script.version });
    read.dataset.read = "";
    const why = script.sites.length === 0 ? undefined : tag("span", "", "why");
    // 既定に入らないスクリプト。チェックは外れた状態で出るが、付ければ走る（capture-ledger は名指しを通す）
    const off = script.enabled ? [] : [tag("span", t("start.scripts.notDefault"), "off")];
    // 名前と対象サイトをまとめる。狭い列で対象サイトや「読む」が折り返しても、名前の下に揃う（理由の行と同じ）
    const head = tag("span", "", "phead");
    head.append(name, ...(script.sites.length === 0 ? [] : [siteChip(script.sites)]), ...off, read);
    label.append(input, head, ...(why === undefined ? [] : [why]));
    const moves = {
      up: t("start.scripts.moveUp", { name: script.id }),
      down: t("start.scripts.moveDown", { name: script.id }),
    };
    picks.push({ script, input, why, ...runRow(script.id, moves, label) });
  }
  if (scripts.length === 0) box.append(tag("span", t("start.scripts.empty"), "muted"));
  syncPicks();
  syncStart(); // 行を置くのは drawRunOrder。本文の大きさも登録済みのスクリプトで変わる
  // 読む窓の版が既定から外れたかもしれない。standing（既定で走る版か）を今の登録済みのスクリプトで言い直す
  if (startRead.doc !== undefined && startRead.target.id !== undefined) drawStartReadHead();
};

/**
 * チェックを起点に合わせる。サイト用のスクリプトは、起点のどれかが対象サイトのホストにあるときだけ押せる
 * （capture-ledger の決まりの写し。`start.js` の `onSeed`）。**人が付け外ししたチェックは覚えたまま** —— 起点を
 * 書き換えて合わなくなれば押せなくなり、合うようになれば、人が選んだとおり（選んでいなければ capture-ledger の既定のとおり）に付く。
 */
const syncPicks = () => {
  const hosts = seedHosts($("start-seeds").value);
  for (const { script, input, why } of picks) {
    const allowed = onSeed(script, hosts);
    input.disabled = !allowed;
    input.checked = allowed && pickedOf(script);
    if (why === undefined) continue;
    why.textContent = allowed
      ? ""
      : hosts.size === 0
        ? t("start.scripts.whyNoSeed")
        : t("start.scripts.whyOffSeed", { sites: script.sites.join(t("common.sep.dot")) });
  }
  drawValues(); // 起点で選べる物が変わると、宣言された値も変わる
};

/**
 * 番号と矢印と行の並びを、いまの選びに合わせる。行を置くのはここだけ。**並びが同じなら行を動かさない** —— 起点や TS を
 * 打つたびに呼ばれるので、動かすと押そうとしている物が手の下で外れる。capture-ledger が空のときの文を消さないよう、
 * `replaceChildren` はしない。
 */
const drawRunOrder = () => {
  const run = runOf();
  const { hosts, scripts } = pickedNow();
  const live = liveOrder(run);
  const rows = shownOrder(run.order, scripts, hosts).map((id) =>
    id === INLINE_ROW ? inlineRow() : picks.find((pick) => pick.id === id),
  );
  for (const { id, no, moves, up, down } of rows) {
    const at = live.indexOf(id);
    no.textContent = at === -1 ? "" : String(at + 1);
    moves.hidden = at === -1;
    up.disabled = at === 0;
    down.disabled = at === live.length - 1;
  }
  inlineRow().el.hidden = !live.includes(INLINE_ROW);
  const box = $("start-picks");
  const drawn = [...box.children].filter((child) => child.classList.contains("pick-row"));
  if (rows.some(({ el }, i) => drawn[i] !== el)) box.append(...rows.map(({ el }) => el));
};

/**
 * いま選んでいる物。起点のホストと、capture-ledger の並びのスクリプトと、そのうち起点に合ってチェックの付いた物の id。
 * `runOf`・`drawValues`・`variablesNow` が同じ物を見る（3 つがばらばらに選ぶと、欄に出た変数と送る変数がずれる）。
 */
const pickedNow = () => {
  const hosts = seedHosts($("start-seeds").value);
  const scripts = picks.map((pick) => pick.script);
  return {
    hosts,
    scripts,
    picked: scripts.filter((script) => onSeed(script, hosts) && pickedOf(script)).map((script) => script.id),
  };
};

/**
 * 欄の「走らせるもの」。組み立ては `start.js` の `scriptsOf`（試験から呼べる）。選んだ物は、起点に合い、
 * チェックの付いた物。既定の顔ぶれ（capture-ledger が `scripts` を省いた頼みに選ぶ物）と同じ物が同じ順なら、送らずに済む。
 */
const runOf = () => {
  const { hosts, scripts, picked } = pickedNow();
  return {
    order: orderOf(moved, scripts.map((script) => script.id)),
    picked,
    defaults: defaultIds(scripts, hosts),
    inline: inlineNow(),
  };
};

/** その場の TS の欄の今の中身。 */
const inlineNow = () => ({
  name: $("start-inline-name").value,
  phase: $("start-inline-preload").checked ? "preload" : "behavior",
  source: $("start-inline-source").value,
});

/** 箱の TS について capture-ledger が答えた宣言と、箱の下の 1 行（`start.js` の `inlineDeclared`）。 */
let inlineAnswer = { params: [], note: "" };

/** 欄に出す宣言（`start.js` の `declaredWith`）。`drawValues` と `variablesNow` が同じ物を見る。 */
const declaredNow = (kind) => {
  const { scripts, picked } = pickedNow();
  return declaredWith(scripts, picked, inlineNow(), inlineAnswer.params, kind);
};

/** 送る変数（`start.js` の `variablesOf`）。宣言された名前のうち、欄に値の在る物。 */
const variablesNow = () => variablesOf(declaredNow("variable"), values);

/** いまの欄から capture-ledger へ送る本文。「始める」と「定期にする」と、大きさの行が同じ物を見る。 */
const startBodyNow = () =>
  startBody($("start-seeds").value, followOf(), runOf(), variablesNow(), $("start-ua-text").value);

/** 最後に描いた宣言の形。同じなら描き直さない —— 打っている欄を手の下で作り直さない。 */
let valuesKey;

/**
 * 値の欄 1 つ。宣言の `schema.enum` があれば選択の欄、ほかは文字の欄。選択の欄は先頭に空の行を置く —— 選ばなければ
 * 送らない（必須なら、始めたときに capture-ledger が 400 で名指す）。
 */
const valueField = (v) => {
  const wanted = values.get(v.name) ?? "";
  if (v.schema?.enum === undefined) {
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.value = wanted;
    if (v.required) input.placeholder = t("start.values.required");
    return input;
  }
  const select = document.createElement("select");
  select.append(
    new Option(v.required ? t("start.values.required") : t("start.values.notPassed"), ""),
    ...v.schema.enum.map((value) => new Option(value, value)),
  );
  // 覚えていた値が選択肢に無ければ空の行に。見えている物が送る物なので、覚えている値も合わせる
  select.value = v.schema.enum.includes(wanted) ? wanted : "";
  values.set(v.name, select.value);
  return select;
};

/**
 * クロールごとの値の欄。選んだスクリプトとその場の TS（`declaredNow`）が宣言した変数を 1 行ずつ（名前・説明・値の欄。必須に印）、
 * シークレットを名前の列に（値の欄は無い —— 値は Windmill の変数に人が置く。必須の印と、WARC に残すかの印が付く）。
 * 宣言が 1 つも無ければ fieldset ごと隠す。
 * 打った値は `values` に持ち、欄を作り直しても戻す。描き直すのはチェックの change と、起点が変わったとき（`syncPicks`）と、
 * 箱の宣言の答えが来たとき（`declaredChanged`）。
 */
const drawValues = () => {
  const vars = declaredNow("variable");
  const secrets = declaredNow("secret");
  const key = JSON.stringify([vars, secrets]);
  if (key === valuesKey) return;
  valuesKey = key;
  $("start-values").hidden = vars.length === 0 && secrets.length === 0;
  $("start-vars-table").hidden = vars.length === 0;
  const body = $("start-vars");
  body.replaceChildren();
  for (const v of vars) {
    const row = document.createElement("tr");
    const head = document.createElement("td");
    const input = valueField(v);
    input.id = `start-var-${v.name}`;
    input.addEventListener("input", () => values.set(v.name, input.value));
    const name = tag("label", v.name, "mono");
    name.htmlFor = input.id;
    head.append(name);
    if (v.required) head.append(tag("span", t("start.values.required"), "req"));
    if (v.summary !== "") head.append(tag("span", v.summary, "vsum"));
    const box = document.createElement("td");
    box.append(input);
    row.append(head, box);
    body.append(row);
  }
  const line = $("start-secrets");
  line.hidden = secrets.length === 0;
  line.replaceChildren();
  if (secrets.length === 0) return;
  // 名前の並び（名前・必須の印・WARC に残すかの印）は要素なので、文に 1 つの値として挟む
  const list = document.createDocumentFragment();
  secrets.forEach((s, i) => {
    if (i > 0) list.append(t("common.sep.comma"));
    list.append(tag("span", s.name, "mono"));
    if (s.required) list.append(tag("span", t("start.values.required"), "req"));
    const archive = archiveTag(s.archive);
    if (archive !== undefined) list.append(" ", archive);
  });
  line.append(...tNodes("start.values.secrets", { list, note: (text) => tag("span", text, "muted") }));
};

/**
 * その場の TS を欄に戻し、新しいクロールの画面へ移る。直して撮り直すため。**起点とスクリプトの選びは触らない。**
 * source は詳しい所に無い（capture-ledger v0.59.0）ので、名前で引くエンドポイントから取る。
 */
const putBack = async (crawlId, name) => {
  let back;
  try {
    back = await api(`/api/crawls/${crawlId}/inline/${enc(name)}`);
  } catch (err) {
    trouble(t("start.inline.cannotPutBack", { said: failedText(err) }));
    return;
  }
  intoForm(name, back.phase, back.source);
};

/**
 * その場の TS を新しいクロールの画面の欄に入れ、その画面へ移る。「欄に戻す」と「直した版を欄に戻す」が使う
 * （直した版は、名前と phase を元のまま、source だけを直した物にする）。**起点とスクリプトの選びは触らない。**
 */
const intoForm = (name, phase, source) => {
  $("start-inline-name").value = name;
  $(phase === "preload" ? "start-inline-preload" : "start-inline-behavior").checked = true;
  $("start-inline-source").value = source;
  $("start-answer").hidden = true; // 前の答えは、戻した TS の物ではない
  location.hash = "start";
  // 画面とタブを今出す —— 隠れた箱には focus が効かない（hashchange が画面を出すのは、この後）
  show("start");
  showStartTab("js");
  drawSource();
  syncStart();
  $("start-inline-source").focus();
};

/**
 * ファイルを読む。**ブラウザの中で読むだけ**で、サーバには何も足さない。capture-scripts の中で
 * 型の補完を効かせて書いたファイルを、そのまま欄に入れるため。名前が空なら、拡張子を除いた
 * ファイル名を入れる（綴りは capture-ledger が見る）。
 */
const readFileIntoForm = async () => {
  const file = $("start-inline-file").files?.[0];
  if (file === undefined) return;
  $("start-inline-source").value = await file.text();
  if ($("start-inline-name").value.trim() === "") {
    $("start-inline-name").value = file.name.replace(/\.[^.]*$/, "");
  }
  $("start-inline-file").value = ""; // 同じファイルをもう 1 度読めるように
  drawSource();
  syncStart();
};

/** 行番号の溝。**行の数が変わったときだけ**組み直す（2 万行でも、打つたびには組まない）。 */
let drawnLines = -1;
const drawGutter = () => {
  const lines = Math.max(1, $("start-inline-source").value.split("\n").length);
  if (lines === drawnLines) return;
  $("start-gutter").textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join("\n");
  drawnLines = lines;
};

/**
 * 空の欄では押せない。**上限を超えた本文も**、送る前に止める（上限は /healthz の writeLimit。
 * 知らなければ止めない —— 門が 413 で言う）。欄の下に、行数・本文の大きさ・上限に対する割合を出す。
 * 走る順の番号と行もここで合わせる（起点・TS の箱・2 択・チェック・↑↓・capture-ledger の描き直しのどれもここを通る）。
 */
const syncStart = () => {
  drawRunOrder();
  const follow = followOf();
  const body = startBodyNow();
  const limit = settings.writeLimit ?? Infinity;
  const size = sizeOf($("start-inline-source").value, bodyBytes(body), limit);
  const line = $("start-size");
  const sized = { lines: size.lines, bytes: size.bytes };
  line.textContent = size.over
    ? t("start.size.over", { limit, over: size.bytes - limit })
    : limit === Infinity
      ? t("start.size.line", sized)
      : t("start.size.lineOfLimit", { ...sized, percent: size.percent });
  line.classList.toggle("bad", size.over);
  // 辿るなら、規則が無いときと、capture-ledger が今の表を「始められない」と言っているときも押せない。capture-ledger に
  // 確かめられなかった（答えが無い）なら止めない —— 始めれば capture-ledger が 400 で言う
  const answer = currentCheck();
  const rulesBad = follow !== null && (follow.rows.length === 0 || (answer !== undefined && !answer.ok));
  $("start-go").disabled = body.seeds.length === 0 || size.over || rulesBad;
  $("schedule-go").disabled =
    $("start-go").disabled || $("schedule-name").value.trim() === "" || $("schedule-cron").value.trim() === "";
};

// ── 辿り方（規則の表）───────────────────────────────────────────────
/** 表の行（`{ action, pattern }`）。始めた後も残す —— 同じ並びで撮り直すことが多い。 */
let ruleRows = PRESETS.host.map((row) => ({ ...row }));

/**
 * capture-ledger の確かめ。`key` は問うた query で、答えは表と起点がその形のときにだけ使う —— 遅れて届いた前の
 * 答えで印を描かない。`answer` が undefined なら、capture-ledger に確かめられなかった（届かない・エンドポイントが無い）。
 */
const rulesCheck = { key: undefined, answer: undefined, timer: undefined };

const following = () => $("start-follow").checked;

/** 送る形の「辿り方」。このページだけなら null。 */
const followOf = () =>
  following()
    ? { maxDepth: $("start-max-depth").value, maxPages: $("start-max-pages").value, rows: ruleRows }
    : null;

/** 今の表と起点に合う答え。合わなければ（確かめている間も）undefined。 */
const currentCheck = () =>
  rulesCheck.key === checkQuery($("start-seeds").value, ruleRows) ? rulesCheck.answer : undefined;

/** 行ごとの印と、最後の 1 行。表の欄は描き直さない（打っている字の位置が飛ぶ）。 */
const drawMarks = () => {
  const answer = currentCheck();
  const marks = marksOf(answer, ruleRows.length);
  for (const row of $("start-rule-rows").rows) {
    const mark = marks[Number(row.dataset.i)];
    row.cells[3].textContent = mark.text;
    row.cells[3].className = mark.bad ? "mark bad" : "mark muted";
  }
  const said = $("start-said");
  if (ruleRows.length === 0) {
    said.textContent = t("start.rules.none");
    said.className = "start-said bad";
    return;
  }
  if (answer === undefined) {
    const asked = rulesCheck.key === checkQuery($("start-seeds").value, ruleRows);
    said.textContent = asked ? t("start.rules.cannotCheck") : t("start.rules.checking");
    said.className = "start-said muted";
    return;
  }
  const summary = summaryOf(answer, followOf());
  said.textContent = summary.text;
  said.className = summary.bad ? "start-said bad" : "start-said";
};

/**
 * 表を描き直す。行の数か並びが変わったときだけ（打っている間は `drawMarks` だけ）。`focus` は描いた後に
 * 置く先 —— 移した行の同じボタン、足した行の当てる物、など。↑↓× は行の番号を言う。
 */
const drawRules = (focus) => {
  const body = $("start-rule-rows");
  body.replaceChildren();
  ruleRows.forEach((rule, i) => {
    const n = String(i + 1);
    const row = document.createElement("tr");
    row.dataset.i = String(i);
    row.append(cell(n, "num mono"));
    const action = document.createElement("select");
    action.dataset.field = "action";
    action.setAttribute("aria-label", t("start.rules.actionOf", { n }));
    for (const value of ACTIONS) {
      const option = tag("option", actionText(value));
      option.value = value;
      option.selected = value === rule.action;
      action.append(option);
    }
    const pattern = document.createElement("input");
    pattern.type = "text";
    pattern.spellcheck = false;
    pattern.dataset.field = "pattern";
    pattern.value = rule.pattern;
    pattern.placeholder = t("start.rules.matchPlaceholder");
    pattern.setAttribute("aria-label", t("start.rules.matchOf", { n }));
    const actionCell = document.createElement("td");
    actionCell.append(action);
    const patternCell = document.createElement("td");
    patternCell.append(pattern);
    const tools = document.createElement("td");
    tools.className = "tools";
    for (const [label, op, what] of [
      ["↑", "-1", t("start.rules.moveUp", { n })],
      ["↓", "1", t("start.rules.moveDown", { n })],
      ["×", "0", t("start.rules.remove", { n })],
    ]) {
      const b = button(label);
      b.dataset.op = op;
      b.setAttribute("aria-label", what);
      b.disabled = (op === "-1" && i === 0) || (op === "1" && i === ruleRows.length - 1);
      tools.append(b);
    }
    row.append(actionCell, patternCell, cell("", "mark muted"), tools);
    body.append(row);
  });
  drawMarks();
  if (focus !== undefined) body.rows[focus.i]?.querySelector(focus.selector)?.focus();
};

/** 表か起点が変わったら、300 ms 止まってから capture-ledger に確かめる。予約は 1 つだけ。 */
const scheduleCheck = () => {
  clearTimeout(rulesCheck.timer);
  if (!following()) return;
  rulesCheck.timer = setTimeout(() => void runCheck(), 300);
};

const runCheck = async () => {
  const key = checkQuery($("start-seeds").value, ruleRows);
  let answer;
  try {
    answer = ruleRows.length === 0 ? undefined : await api(`/api/crawl-rules/check?${key}`);
  } catch {
    answer = undefined;
  }
  if (key !== checkQuery($("start-seeds").value, ruleRows)) return; // 表が変わった。次の確かめが描く
  rulesCheck.key = key;
  rulesCheck.answer = answer;
  drawMarks();
  syncStart();
};

/** 表を替えた後の 3 つ（描く・確かめる・「始める」を合わせる）。 */
const rulesChanged = (focus) => {
  drawRules(focus);
  scheduleCheck();
  syncStart();
};

$("start-rule-rows").addEventListener("input", (event) => {
  const row = event.target.closest("tr");
  const field = event.target.dataset.field;
  if (row === null || field === undefined) return;
  const i = Number(row.dataset.i);
  ruleRows = ruleRows.map((rule, k) => (k === i ? { ...rule, [field]: event.target.value } : rule));
  drawMarks(); // 前の答えの印は、今の表に合わないので消える
  scheduleCheck();
  // 「始める」は、form の input の受け手が合わせる
});
$("start-rule-rows").addEventListener("click", (event) => {
  const b = event.target.closest("button[data-op]");
  if (b === null) return;
  const i = Number(b.closest("tr").dataset.i);
  const op = Number(b.dataset.op);
  if (op === 0) {
    ruleRows = removeRow(ruleRows, i);
    // 消した行の位置に来た行の ×。最後の行を消したなら 1 つ上の ×、空なら「行を足す」へ
    const next = Math.min(i, ruleRows.length - 1);
    if (next < 0) {
      rulesChanged();
      $("start-add-row").focus();
    } else rulesChanged({ i: next, selector: 'button[data-op="0"]' });
    return;
  }
  ruleRows = moveRow(ruleRows, i, op);
  // 移した先の、同じボタン。端に着いて押せなくなったら、反対向きのボタン
  const to = i + op;
  const end = (op === -1 && to === 0) || (op === 1 && to === ruleRows.length - 1);
  rulesChanged({ i: to, selector: `button[data-op="${end ? String(-op) : String(op)}"]` });
});
$("start-presets").addEventListener("click", (event) => {
  const b = event.target.closest("button[data-preset]");
  if (b === null) return;
  ruleRows = PRESETS[b.dataset.preset].map((row) => ({ ...row }));
  rulesChanged();
});
$("start-add-skip").onclick = () => {
  ruleRows = addSkipRow(ruleRows);
  rulesChanged({ i: 0, selector: 'input[data-field="pattern"]' });
};
$("start-add-row").onclick = () => {
  ruleRows = addRow(ruleRows);
  rulesChanged({ i: ruleRows.length - 1, selector: 'input[data-field="pattern"]' });
};

/** 2 択に合わせて「辿り方」のタブを出し入れする。辿るを選んだら、そのタブを開いて確かめる。 */
const syncFollow = () => {
  if (following()) {
    showStartTab("rules");
    scheduleCheck();
  } else if (!$("start-rules").hidden) {
    showStartTab("js");
  } else {
    $("start-tab-rules").hidden = true;
  }
};
$("start-page").addEventListener("change", syncFollow);
$("start-follow").addEventListener("change", syncFollow);

/**
 * 箱の TS が宣言した変数を、箱が止まってから capture-ledger に訊く（`POST /api/scripts/check`。行は立たない）。箱が空なら訊かない。
 * 答えが今の箱の物なら、値の欄と「始める」を合わせる（同じ宣言なら `valuesKey` が欄を作り直さない）。
 */
const declaredChanged = askWhenSettled({
  current: () => {
    const { source, phase } = inlineNow();
    return JSON.stringify({ source, phase });
  },
  ask: async (asked) => {
    if (JSON.parse(asked).source.trim() === "") return { params: [], note: "" };
    let status = 0;
    let body = {};
    try {
      const res = await fetch("/api/scripts/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: asked,
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch (err) {
      body = { error: failedText(err) };
    }
    return inlineDeclared(status, body);
  },
  answered: (answer) => {
    inlineAnswer = answer;
    $("start-inline-note").hidden = answer.note === "";
    $("start-inline-note").textContent = answer.note;
    drawValues();
    syncStart();
  },
});

/**
 * 箱の中身が変わったら、溝と「型を検査しない」のチェックを中身に合わせ、宣言を訊き直す（貼った JS が印を持っていれば
 * 付く）。欄に戻す・ファイル・下敷きは value を直に入れて input を出さないので、全部の道がここを通る。
 * **チェックを押したときには呼ばない** —— checkbox は change の前に input を出すので、そこで
 * 中身から読み直すと、押した向きが change に届く前に戻ってしまう。
 */
const drawSource = () => {
  drawGutter();
  $("start-nocheck").checked = hasNocheck($("start-inline-source").value);
  declaredChanged();
};

/** 送った「始める」の鍵（`start.js` の `keyFor`）。届いたか分からない間だけ持つ。 */
let startKey;

/**
 * 欄から 1 本始める。**送る前に検査しない** —— 読めない URL は capture-ledger が 400 で言う。
 * 答えは欄の下に 1 行で、capture-ledger の句と理由の文は辞書に在れば訳して出す（`start.js` の `startAnswer`）。
 */
const startCrawl = async (event) => {
  event.preventDefault();
  const body = startBodyNow();
  if (body.seeds.length === 0) return;
  $("start-go").disabled = true;
  const text = JSON.stringify(body);
  startKey = keyFor(startKey, text, () => crypto.randomUUID());
  let status = 0;
  let answer = {};
  try {
    const res = await fetch("/api/crawls", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": startKey.key },
      body: text,
    });
    status = res.status;
    answer = await res.json().catch(() => ({}));
  } catch (err) {
    answer = { error: failedText(err) };
  }
  if (!keepsKey(status)) startKey = undefined;
  const said = startAnswer(status, answer);
  const line = $("start-answer");
  line.hidden = false;
  line.className = `start-answer state ${said.kind}`;
  line.textContent = said.text;
  // 起点は消す。その場の TS は残す —— 直して撮り直すことが多い。サイト用のチェックは起点に合わせる
  if (status === 202) {
    $("start-seeds").value = "";
    syncPicks();
    scheduleCheck(); // 起点が変わった
  }
  syncStart();
  // 202 は始めた 1 本、409 は塞いでいる 1 本。どちらも印を付けて、すぐ引き直す
  if (typeof answer.crawlId === "string") {
    spotlight = answer.crawlId;
    location.hash = "crawls"; // 印は一覧の画面で見る
    await refresh();
  }
};

// 箱・起点・チェック・2 択のどれが変わっても、大きさの行と「始める」を合わせる。溝と「型を検査しない」は
// 箱のときだけ、サイト用のチェックは起点のときだけ
$("start").addEventListener("input", (event) => {
  if (event.target === $("start-inline-source")) drawSource();
  // 遷移の前では宣言できない（BH0004）。訊く本文の phase も変わる
  if (event.target === $("start-inline-behavior") || event.target === $("start-inline-preload")) declaredChanged();
  if (event.target === $("start-seeds")) {
    syncPicks();
    drawMarks(); // 前の起点の答えは、今の起点に合わない
    scheduleCheck(); // same-site は起点で変わり、起点が辿られるかも capture-ledger が見る
  }
  if (event.target === $("start-max-depth") || event.target === $("start-max-pages")) drawMarks();
  syncStart();
});
$("start-inline-source").addEventListener("scroll", (event) => {
  $("start-gutter").scrollTop = event.target.scrollTop;
});
$("start-nocheck").addEventListener("change", (event) => {
  const box = $("start-inline-source");
  box.value = withNocheck(box.value, event.target.checked); // 見えている物が送る物
  drawSource();
  syncStart();
});
$("start").addEventListener("submit", (event) => void startCrawl(event));

// ── 定期にする ─────────────────────────────────────────────────────
/** 書き込みのエンドポイントに JSON を送る。門は content-type を見るので、本文が無い操作も `{}` を送る。 */
const postJson = async (path, body = {}) => {
  let status = 0;
  let answer = {};
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    status = res.status;
    answer = await res.json().catch(() => ({}));
  } catch (err) {
    answer = { error: failedText(err) };
  }
  return { status, answer };
};

/** いまの欄の中身で予定を作る。**送る前に検査しない** —— cron も頼みの中身も capture-ledger が見て、文で答える。 */
const makeSchedule = async () => {
  const request = startBodyNow();
  if (request.seeds.length === 0) return;
  $("schedule-go").disabled = true;
  const { status, answer } = await postJson(
    SCHEDULES_PATH,
    createBody($("schedule-name").value, $("schedule-cron").value, request),
  );
  const said = createAnswer(status, answer);
  const line = $("schedule-answer");
  line.hidden = false;
  line.className = `start-answer state ${said.kind}`;
  line.textContent = said.text;
  if (status === 201) {
    $("schedule-name").value = "";
    await refreshSchedules();
  }
  syncStart();
};
$("schedule-go").onclick = () => void makeSchedule();
// 名前と式の欄で Enter を押しても、クロールを始めない（form の submit は「始める」）
for (const id of ["schedule-name", "schedule-cron"]) {
  $(id).addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!$("schedule-go").disabled) void makeSchedule();
  });
}
$("schedule-presets").append(
  ...cronPresets().map((preset) =>
    button(preset.label, () => {
      $("schedule-cron").value = preset.cron;
      syncStart();
    }),
  ),
);
// 型を入れるだけ。欄の input と同じ道を通すので、本文の大きさも一緒に数え直す
$("start-ua-compatible").addEventListener("click", () => {
  const box = $("start-ua-text");
  box.value = "{chrome} BrowserHive";
  box.dispatchEvent(new Event("input", { bubbles: true }));
});
$("start-inline-file").addEventListener("change", () => void readFileIntoForm());

// ── 検証 ───────────────────────────────────────────────────────────
/**
 * 1 本の報告を描く。**文は 1 つも持たない** —— message も日本語も spec の節も、
 * daemon が解決して返したものをそのまま出す (`renderJson(report, locale)`)。
 * ここで言い換えると、検証器が言い始めたことと workbench がずれていく。
 */
const drawReport = (td, report) => {
  td.replaceChildren();
  const s = report.summary;
  const bar = document.createElement("div");
  bar.className = "bar";
  const v = verdict(s);
  bar.append(
    tag("span", t("archives.report.passed", { n: s.passed }), "big"),
    tag("span", v.text, `big state ${v.kind}`),
    tag(
      "span",
      [...judgedUnder(report), `${String(s.durationMs)} ms`, ...statsOf(report)].join(t("common.sep.slash")),
      "mono muted",
    ),
  );
  td.append(bar);

  for (const issue of report.issues) {
    const line = document.createElement("div");
    line.className = "line";
    line.append(
      tag("span", issue.severity, `state ${severityKind(issue.severity)}`),
      tag("span", issue.rule, "mono"),
      tag("span", issue.message),
    );
    // **spec へのリンクも daemon が持っている。** workbench が URL を組み立てない。
    if (issue.specUrl) {
      const a = document.createElement("a");
      a.href = issue.specUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = t("archives.report.spec");
      a.className = "mono";
      line.append(a);
    }
    td.append(line);
  }

  for (const entry of report.entries) {
    const line = document.createElement("div");
    line.className = "line";
    line.append(
      tag("span", entry.present ? "entry" : t("archives.report.missing"), entry.present ? "muted" : "state warn"),
      tag("span", entry.path, "mono"),
      tag(
        "span",
        entry.present ? `${String(entry.uncompressedSize ?? 0)} B` : t("archives.report.missingNote"),
        "mono muted",
      ),
    );
    td.append(line);
  }
};

/**
 * 検証の答え（アーカイブの id → `{ answer, open }`）。**id で覚え、描き直しのたびに付け直す** —— 表は引くたびに
 * 作り直す（走行中のクロールが在れば 2 秒ごと）ので、DOM に置いただけの答えは次の引きで消える。
 *
 *   answer  報告のデータ。まだ検証していなければ undefined、検証できなければ Error
 *   asking  検証している間 true（押し直す間も、前の結論は欄に残す）
 *   open    報告の行を開いているか。もう 1 度押すと閉じるが、answer（結論）は残る
 *
 * 忘れるのは、アーカイブが一覧から消えた時とページを読み直した時（クロールの `opened` と同じ型）。
 */
const checks = new Map();

/** 「仕様どおりか」の欄。結論はここに残る（報告を閉じても、引き直しをまたいでも）。 */
const verdictCellOf = (id) => {
  const td = document.createElement("td");
  const v = checkVerdict(checks.get(id)?.answer);
  if (v !== undefined) td.append(tag("span", v.text, `state ${v.kind}`));
  return td;
};

/** 開いた報告の行。最後の答えで描く。 */
const checkRow = (id) => {
  const row = document.createElement("tr");
  row.className = "detail";
  row.dataset.archive = id;
  const td = document.createElement("td");
  td.colSpan = 8;
  const { answer, asking } = checks.get(id) ?? {};
  if (asking || answer === undefined) td.textContent = t("archives.check.asking");
  else if (answer instanceof Error) td.textContent = failedText(answer);
  else drawReport(td, answer);
  row.append(td);
  return row;
};

/** 1 本の行（結論の欄と報告の行）だけを、覚えた答えで描き直す。 */
const redrawCheck = (id) => {
  const body = $("archives");
  const row = [...body.querySelectorAll("tr[data-archive]:not(.detail)")].find(
    (tr) => tr.dataset.archive === id,
  );
  if (row === undefined) return;
  row.children[4].replaceWith(verdictCellOf(id));
  const next = row.nextElementSibling;
  if (next?.classList.contains("detail")) next.remove();
  if (checks.get(id)?.open) row.after(checkRow(id));
};

/**
 * 押されたら 1 本検証する。**押すまで走らせない** —— 一覧を開くだけで走らせない。
 * 開いている報告をもう 1 度押すと閉じる（結論は残る）。
 *
 * 結果は行にも残す。閉じたあとに「この 1 本はどうだったか」が消えると、
 * 何本か見たときに**もう一度押さないと思い出せない**。
 */
const toggleCheck = async (id) => {
  const entry = checks.get(id);
  if (entry?.open) {
    entry.open = false;
    redrawCheck(id);
    return;
  }
  // 結論は押し直す間も残す（新しい答えが来るまで古い答えを出す）
  checks.set(id, { answer: entry?.answer, asking: true, open: true });
  redrawCheck(id);
  let answer;
  try {
    answer = await post(`/wacz/${enc(id)}/validate?locale=${langOf()}`);
  } catch (err) {
    answer = asError(err);
  }
  const now = checks.get(id);
  if (now === undefined) return; // 待っている間に一覧から消えた
  now.answer = answer;
  now.asking = false;
  redrawCheck(id);
};

// ── アーカイブ ─────────────────────────────────────────────────────
let archives = [];

const drawArchives = () => {
  const body = $("archives");
  body.replaceChildren();
  $("archives-empty").hidden = archives.length > 0;
  for (const archive of archives) {
    const row = document.createElement("tr");
    row.dataset.archive = archive.id;
    row.append(cell(archive.sourceUrl, "wide"));
    row.append(cell(archive.labels.join(" ")));
    row.append(cell(dateTime(new Date(archive.capturedAt)), "mono"));
    // **null は「分からない」。** 「不完全」と同じに描かない。
    row.append(
      cell(
        archive.waczComplete === null
          ? "—"
          : archive.waczComplete
            ? t("archives.row.complete")
            : t("archives.row.incomplete"),
      ),
    );
    const check = document.createElement("td");
    check.append(button(t("archives.row.validate"), () => void toggleCheck(archive.id)));
    row.append(verdictCellOf(archive.id));
    row.append(check);
    row.append(hashCell(waczHash(archive.id), t("archives.row.open")));
    const replays = document.createElement("td");
    replays.className = "replays";
    for (const viewer of VIEWERS) {
      replays.append(link(replaywebHref(settings[viewer.setting], archive), viewerText(viewer)));
    }
    row.append(replays);
    body.append(row);
    if (checks.get(archive.id)?.open) body.append(checkRow(archive.id));
  }
};

// ── 検索 ───────────────────────────────────────────────────────────
/**
 * 検索の画面の状態。**引くのは押したときと URL で開いたときだけ** —— 引き直しの周回（refresh）には入れない。
 * 検索の答えない capture-ledger（OpenSearch が落ちている・古い capture-ledger）で、周回ごと落とさないため。
 */
const searching = {
  /** 最後に開いた URL。タブ「検索」はここへ戻る（WACZ の画面の wacz.hash と同じ） */
  hash: undefined,
  /** 最後に引いた語。同じ語の URL へ戻っただけなら引き直さない */
  words: undefined,
  /** 引いた回の番号。遅れて届いた前の答えで、後の答えを上書きしない */
  seq: 0,
};

const drawHits = (hits) => {
  const body = $("search-hits");
  body.replaceChildren();
  // WACZ の画面で開けるのは、一覧（引き直しの答え）に在るアーカイブだけ
  const known = new Set(archives.map((a) => a.id));
  for (const hit of hits) {
    const row = document.createElement("tr");
    row.append(cell(stageLabel(hit.stage), "mono"));
    const what = document.createElement("td");
    what.className = "hit";
    what.append(tag("div", hit.title === "" ? t("search.hit.untitled") : hit.title));
    what.append(tag("div", hit.url, "hit-url mono"));
    for (const fragment of hit.highlight ?? []) {
      const line = document.createElement("div");
      line.className = "hit-snippet";
      for (const part of highlightParts(fragment)) {
        line.append(part.mark ? tag("mark", part.text) : document.createTextNode(part.text));
      }
      what.append(line);
    }
    if (typeof hit.textWithheld === "string") {
      what.append(tag("div", t("search.hit.withheld", { reason: hit.textWithheld }), "hit-note"));
    }
    if (hit.textTruncated === true) what.append(tag("div", t("search.hit.truncated"), "hit-note"));
    what.append(
      tag("div", t("search.hit.source", { url: hit.sourceUrl, at: dateTime(new Date(hit.capturedAt)) }), "hit-note"),
    );
    row.append(what);
    // 行き先: WACZ の画面（一覧に在るアーカイブだけ）と replayweb-server
    const go = document.createElement("td");
    go.className = "hit-go";
    if (known.has(hit.archiveId)) {
      const open = document.createElement("a");
      open.href = waczHash(hit.archiveId);
      open.textContent = t("search.hit.open");
      go.append(open);
    }
    for (const viewer of VIEWERS) {
      go.append(link(hitReplaywebHref(settings[viewer.setting], hit), viewerText(viewer)));
    }
    row.append(go);
    body.append(row);
  }
};

const runSearch = async (words) => {
  searching.words = words;
  $("search-words").value = words;
  const answer = $("search-answer");
  const table = $("search-table");
  if (words === "") {
    answer.hidden = true;
    table.hidden = true;
    $("search-hits").replaceChildren();
    return;
  }
  const seq = (searching.seq += 1);
  answer.hidden = false;
  answer.className = "search-answer";
  answer.textContent = t("search.asking", { words });
  const failed = (text) => {
    answer.className = "search-answer bad";
    answer.textContent = text;
    table.hidden = true;
  };
  let res;
  let body;
  try {
    res = await fetch(searchPath(words));
    body = await res.json().catch(() => ({}));
  } catch (err) {
    if (seq === searching.seq) failed(searchFailure(0, { message: failedText(err) }));
    return;
  }
  if (seq !== searching.seq) return; // 後から打った語の答えを、先に描いている
  if (!res.ok) {
    failed(searchFailure(res.status, body));
    return;
  }
  const { hits, total } = answerOf(body);
  drawHits(hits);
  table.hidden = hits.length === 0;
  answer.textContent =
    hits.length === 0
      ? t("search.none", { words })
      : t("search.found", { words, n: total });
};

$("search").onsubmit = (event) => {
  event.preventDefault();
  const words = $("search-words").value.trim();
  const hash = searchHash(words);
  // 同じ語でも、押したら引き直す（索引は後から増える）。違う語なら URL を替え、route が引く
  if (location.hash === hash) void runSearch(words);
  else location.hash = hash;
};

// ── スクリプト集（読む所）──────────────────────────────────────────
/**
 * 読む所の状態。**取るのは開いたときだけ** —— 一覧（有効な各 id の最新版）は引き直しの答えを使い、版のリンクと
 * 1 版の中身は開いた id の分だけ取る。受け皿の型は画面を最初に開いたとき 1 回で、refresh には入れない
 * （入れると、型を取り込んでいない capture-ledger で引き直し全体が落ちる）。
 */
const reading = {
  /** 最後に開いた URL。タブ「スクリプト集」はここへ戻る（WACZ の画面の wacz.hash と同じ） */
  hash: undefined,
  /** 開いている物: URL が名指した物（target）と、その中身（doc。版か型） */
  open: undefined,
  /** 1 版の中身。`id@版` で覚え、版の一覧の sha256 と食い違えば取り直す（番号は使い回される） */
  docs: new Map(),
  /** 有効な各 id の最新版（GET /api/scripts の最後の答え）。サイト用のスクリプトも対象サイトつきで入る */
  latest: [],
  /** 受け皿の型。undefined はまだ訊いていない、null は capture-ledger に無い（404） */
  types: undefined,
  /** 最後に描いた一覧の形。同じなら描き直さない */
  listKey: undefined,
  /** 開くたびに増やす。遅れて届いた答えが、後から開いた物を描き潰さないように */
  ticket: 0,
};

const TYPES_KEY = "types";
const keyOf = (target) => target.id ?? TYPES_KEY;

/**
 * 本文を出す所の組。スクリプト集の画面（読む所）と、新しいクロールの右の列（読む窓）が同じ部品で描き、
 * 違うのは要素の組だけ —— 見出し・本文の上の 1 行・色の 1 行・書きかけの確認・本文。
 */
const placeOf = (prefix) => ({
  head: $(`${prefix}-head`),
  note: $(`${prefix}-note`),
  colors: $(`${prefix}-colors`),
  ask: $(`${prefix}-ask`),
  lines: $(`${prefix}-lines`),
});
const IN_CATALOG = placeOf("reading");

/** 404 なら undefined（在らないのは誤りではなく、言い方を変えるだけ）。ほかの失敗は投げる。 */
const find = async (path) => {
  const res = await fetch(path);
  if (res.status === 404) return undefined;
  const body = await res.json();
  if (!res.ok) throw new Error(errorText(body) ?? `${path} → ${String(res.status)}`);
  return body;
};

/** 一覧の 1 項目。ふつうの <a> なので、中ボタンで別の窓に開ける（書く欄と並べる道）。対象サイトがあれば名前に添える */
const listItem = (href, name, version, key, sites = []) => {
  const a = document.createElement("a");
  a.href = href;
  a.className = "ritem";
  a.dataset.key = key;
  const label = tag("span", name, "rname");
  if (sites.length > 0) label.append(siteChip(sites, ""));
  a.append(label, tag("small", version));
  return a;
};

/** 一覧で、開いている物に印を付ける。描き直さずに class だけ替える。 */
const markListed = () => {
  const key = reading.open === undefined ? undefined : keyOf(reading.open.target);
  for (const a of $("reading-list").querySelectorAll("a.ritem")) {
    a.classList.toggle("on", a.dataset.key === key);
  }
};

/**
 * 一覧（既定で走る版・サイト用の版・既定では走らない版・書くための受け皿の型）。**変わったときだけ描き直す** —— 一覧は
 * 走行中なら 2 秒ごとに引くので、毎回作り直すと、押そうとしている項目が手の下で入れ替わる（drawPicks と同じ）。
 */
const drawReadingList = () => {
  $("scripts-empty").hidden = reading.latest.length > 0;
  const types = reading.types;
  const key = [
    ...reading.latest.map((s) => `${s.id}@${String(s.version)}~${s.sha256}~${s.sites.join(" ")}~${String(s.enabled)}`),
    `types@${types === undefined ? "?" : types === null ? "-" : `${String(types.version)}~${types.sha256}`}`,
  ].join(",");
  if (key !== reading.listKey) {
    reading.listKey = key;
    const nav = $("reading-list");
    const item = (s) => listItem(readingHash({ id: s.id }), s.id, `v${String(s.version)}`, s.id, s.sites);
    const anywhere = reading.latest.filter((s) => s.enabled && s.sites.length === 0);
    const onSites = reading.latest.filter((s) => s.enabled && s.sites.length > 0);
    const off = reading.latest.filter((s) => !s.enabled);
    nav.replaceChildren(tag("span", t("scripts.list.default"), "grp"));
    if (anywhere.length === 0) {
      nav.append(
        tag("span", reading.latest.length === 0 ? t("scripts.list.noneRegistered") : t("scripts.list.none"), "muted"),
      );
    }
    nav.append(...anywhere.map(item));
    if (onSites.length > 0) {
      nav.append(tag("span", t("scripts.list.sites"), "grp"), ...onSites.map(item));
    }
    if (off.length > 0) {
      nav.append(tag("span", t("scripts.list.off"), "grp"), ...off.map(item));
    }
    nav.append(tag("span", t("scripts.list.types"), "grp"));
    if (types === null) nav.append(tag("span", t("scripts.list.typesMissing"), "muted"));
    if (types !== null && types !== undefined) {
      nav.append(listItem(TYPES_HASH, "host.d.ts", `v${String(types.version)}`, TYPES_KEY));
    }
  }
  markListed();
};

/**
 * 本文の上の 1 行。太字の文と、続く文 —— 辞書の 1 つの文で、`<b>…</b>` の中が太字（`tNodes` に `noteBold` を渡して組む）。
 * undefined なら隠す。
 */
const readingNote = (at, parts, kind = "warn") => {
  const p = at.note;
  p.hidden = parts === undefined;
  if (parts === undefined) return;
  p.className = `reading-note ${kind}`;
  p.replaceChildren(...parts);
};
const noteBold = (text) => tag("b", text);

/** 受け皿の型が capture-ledger に無いときの 1 行。読む所と読む窓で同じ字。 */
const noteTypesMissing = (at) => {
  readingNote(at, tNodes("scripts.note.typesMissing", { b: noteBold }), "bad");
};

/** 読めなかったときの 1 行。読む所と読む窓で同じ字。 */
const noteUnreadable = (at, err) => {
  readingNote(at, tNodes("scripts.note.unreadable", { b: noteBold, said: failedText(err) }), "bad");
};

/** 行に印を付ける。印は 1 つだけなので、付いている物を外して付け直す（5 千行を回さない）。 */
const markLine = (at, n, { scroll }) => {
  const list = at.lines;
  for (const li of list.querySelectorAll("li.sel")) li.classList.remove("sel");
  const li = list.children[n - 1];
  if (li === undefined) return;
  li.classList.add("sel");
  if (scroll) li.scrollIntoView({ block: "center" });
};

/** 本文。1 行 1 つの <li>（WACZ の画面の行の並びと同じ組み方）。行の印は class 1 つ。 */
const drawLines = (at, source, line) => {
  const list = at.lines;
  if (source === undefined) {
    list.replaceChildren();
    return;
  }
  const lines = document.createDocumentFragment();
  linesOf(source).forEach((text, i) => {
    const li = document.createElement("li");
    li.dataset.n = String(i + 1);
    li.append(tag("span", String(i + 1), "n"), tag("span", text, "t"));
    lines.append(li);
  });
  list.replaceChildren(lines);
  if (line !== undefined) markLine(at, line, { scroll: true });
};

// 押した行を URL に。**hashchange を発火させずに**（WACZ の画面の remember と同じ。発火すると読み直す）
IN_CATALOG.lines.addEventListener("click", (event) => {
  const li = event.target.closest("li");
  if (li === null || reading.open?.doc === undefined) return;
  const n = Number(li.dataset.n);
  reading.hash = readingHash({ ...reading.open.target, line: n });
  history.replaceState(null, "", reading.hash);
  markLine(IN_CATALOG, n, { scroll: false });
});

// ── 色付け（読む所）──────────────────────────────────────────────
/**
 * 色を付ける worker。**読む所が初めて色を要るときに 1 つだけ作る**（Shiki の 374 KB を読むのも、そのとき）。
 * 答えは sha256 で覚える —— 同じ版を開き直しても、もう 1 度は訊かない。
 */
const painter = { worker: undefined, broken: undefined, asked: 0, waiting: new Map(), kept: new Map() };

const colorsOf = (doc) => {
  const kept = painter.kept.get(doc.sha256);
  if (kept !== undefined) return Promise.resolve(kept);
  if (painter.broken !== undefined) return Promise.reject(painter.broken);
  if (painter.worker === undefined) {
    painter.worker = new Worker("/highlight-worker.js", { type: "module" });
    painter.worker.onmessage = ({ data }) => {
      const wait = painter.waiting.get(data.id);
      painter.waiting.delete(data.id);
      if (data.error !== undefined) wait?.reject(new Error(data.error));
      else wait?.resolve(data.lines);
    };
    // 起動できない（/vendor/shiki.js が 404 など）。Chrome は message を空で寄こし、頼みには答えない ——
    // 待っている物を全部断り、以後は訊かない
    painter.worker.onerror = (event) => {
      painter.broken = new Error(event.message || t("scripts.colors.workerFailed"));
      for (const wait of painter.waiting.values()) wait.reject(painter.broken);
      painter.waiting.clear();
    };
  }
  const id = ++painter.asked;
  return new Promise((resolve, reject) => {
    painter.waiting.set(id, { resolve, reject });
    painter.worker.postMessage({ id, source: doc.source });
  }).then((lines) => {
    painter.kept.set(doc.sha256, lines);
    return lines;
  });
};

/**
 * 描いた行に色を塗る。li はそのまま（押した行と流した位置が動かない）。**1 コマに 8 ms まで** ——
 * 6,061 行を一度に塗ると、span を 1.7 万個組むので画面が 0.3 秒止まる（Chrome 153）。コマの間に
 * 開き直したら、そこでやめる（遅れて届いた別の版の色を、いま描いている行に塗らない）。
 * 行の数が合わなければ塗らない（Shiki の行の分け方が linesOf と違ったとき）。
 */
const paintLines = (at, lines, stale) => {
  const items = at.lines.children;
  if (items.length !== lines.length) return;
  let next = 0;
  const slice = () => {
    if (stale()) return;
    const until = performance.now() + 8;
    for (; next < lines.length && performance.now() < until; next++) {
      const pieces = document.createDocumentFragment();
      for (const [piece, light, dark] of lines[next]) {
        const span = tag("span", piece);
        span.style.setProperty("--l", light);
        span.style.setProperty("--d", dark);
        pieces.append(span);
      }
      items[next].lastElementChild.replaceChildren(pieces);
    }
    if (next < lines.length) requestAnimationFrame(slice);
  };
  // 次のコマから。覚えた色でも、1 色の行を先に見せる
  requestAnimationFrame(slice);
};

/** 1 色で描いた後に呼ぶ。開き直していなければ塗る。塗れなければ、本文の上の 1 行で言う（本文は読めるまま）。 */
const colorize = (at, doc, stale) =>
  colorsOf(doc)
    .then((lines) => {
      paintLines(at, lines, stale);
    })
    .catch((err) => {
      if (stale()) return;
      const note = at.colors;
      note.textContent = t("scripts.colors.failed", { said: failedText(err) });
      note.hidden = false;
    });

/** 写す。http://127.0.0.1 は安全な文脈なので clipboard が使える。断られたら上の帯で言う。 */
const copyButton = (source) => {
  const b = button(t("scripts.actions.copy"), async () => {
    try {
      await navigator.clipboard.writeText(source);
      b.textContent = t("scripts.actions.copied");
      setTimeout(() => {
        b.textContent = t("scripts.actions.copy");
      }, 1500);
    } catch (err) {
      trouble(t("scripts.actions.copyFailed", { said: failedText(err) }));
    }
  });
  return b;
};

/**
 * 見出し: 名前（と版のリンク・サイト用なら対象サイト）・事実の 1 行・ボタンと注記。名前を省くと名前の行を描かない
 * （新しいクロールの読む窓は、タブが名前）。
 */
const drawReadingHead = (at, { name, chips, sites = [], facts, standing, actions = [], aside }) => {
  const rows = [];
  if (name !== undefined) {
    const title = document.createElement("div");
    title.className = "rtitle";
    title.append(tag("b", name));
    if (sites.length > 0) title.append(siteChip(sites));
    if (chips !== undefined) title.append(chips);
    rows.push(title);
  }
  const meta = tag("div", facts.join(" · "), "rmeta");
  if (standing !== undefined) {
    meta.append(document.createTextNode(" · "), tag("span", standing.text, `state ${standing.kind}`));
  }
  const row = document.createElement("div");
  row.className = "ractions";
  row.append(...actions);
  if (aside !== undefined) row.append(tag("span", aside, "muted"));
  at.head.replaceChildren(...rows, meta, row);
};

/** 版のリンク。押すとその版の URL へ（版を替えるのは移動なので、履歴に残す）。 */
const chipsOf = (id, versions, shown, defaultVersion) => {
  const box = document.createElement("span");
  box.className = "rchips";
  for (const v of versions) {
    const a = document.createElement("a");
    a.href = readingHash({ id, version: v.version });
    a.textContent =
      v.version === defaultVersion
        ? t("scripts.chip.default", { version: v.version })
        : v.enabled
          ? `v${String(v.version)}`
          : t("scripts.chip.disabled", { version: v.version });
    if (v.version === shown) a.className = "on";
    box.append(a);
  }
  return box;
};

/** 1 版の中身。覚えた物の sha256 が版の一覧と違えば（番号が使い回された）取り直す。 */
const docOf = async (id, version, sha256) => {
  const key = `${id}@${String(version)}`;
  const kept = reading.docs.get(key);
  if (kept !== undefined && kept.sha256 === sha256) return kept;
  const doc = await api(`/api/scripts/${enc(id)}/versions/${String(version)}`);
  reading.docs.set(key, doc);
  return doc;
};

const openTypes = (target, stale) => {
  const types = reading.types;
  reading.open = { target, doc: types ?? undefined };
  markListed();
  if (types === null) {
    drawReadingHead(IN_CATALOG, { name: "host.d.ts", facts: [] });
    noteTypesMissing(IN_CATALOG);
    drawLines(IN_CATALOG, undefined);
    return;
  }
  drawReadingHead(IN_CATALOG, {
    name: `host.d.ts v${String(types.version)}`,
    facts: metaOf(types),
    actions: [copyButton(types.source)],
    aside: t("scripts.types.aside"),
  });
  readingNote(IN_CATALOG, undefined);
  drawLines(IN_CATALOG, types.source, target.line);
  void colorize(IN_CATALOG, types, stale);
};

const openScript = async (target, stale) => {
  reading.open = { target, doc: undefined };
  markListed();
  const listed = await find(`/api/scripts/${enc(target.id)}/versions`);
  if (stale()) return;
  if (listed === undefined) {
    drawReadingHead(IN_CATALOG, { name: target.id, facts: [] });
    readingNote(IN_CATALOG, tNodes("scripts.note.notRegistered", { b: noteBold, id: target.id }), "bad");
    drawLines(IN_CATALOG, undefined);
    return;
  }
  const defaultVersion = defaultVersionOf(reading.latest, target.id);
  const version = target.version ?? reading.latest.find((s) => s.id === target.id)?.version ?? listed.versions[0].version;
  const chips = chipsOf(target.id, listed.versions, version, defaultVersion);
  const entry = listed.versions.find((v) => v.version === version);
  if (entry === undefined) {
    drawReadingHead(IN_CATALOG, { name: `${target.id} v${String(version)}`, chips, facts: [] });
    readingNote(IN_CATALOG, tNodes("scripts.note.versionGone", { b: noteBold, version }));
    drawLines(IN_CATALOG, undefined);
    return;
  }
  const doc = await docOf(target.id, version, entry.sha256);
  if (stale()) return;
  reading.open = { target, doc };
  drawReadingHead(IN_CATALOG, {
    name: `${doc.id} v${String(doc.version)}`,
    chips,
    sites: doc.sites,
    facts: [...metaOf(doc), optionsText(doc.options)],
    standing: standingOf(doc, defaultVersion),
    actions: [copyButton(doc.source), button(t("scripts.actions.template"), () => putTemplate(doc))],
    aside: t("scripts.aside.lines"),
  });
  // URL の sha256 の頭（クロールの「読む」が付ける）が、開いた版と食い違えば言う。本文は出す
  if (target.sha !== undefined && !doc.sha256.startsWith(target.sha)) {
    readingNote(
      IN_CATALOG,
      tNodes("scripts.note.shaMismatch", { b: noteBold, version, ran: target.sha, registered: doc.sha256.slice(0, 12) }),
    );
  } else {
    readingNote(IN_CATALOG, undefined);
  }
  drawLines(IN_CATALOG, doc.source, target.line);
  void colorize(IN_CATALOG, doc, stale); // 1 色で読めるようにしてから、worker の答えを同じ行に塗る
};

/** 受け皿の型。訊くのは最初の 1 回（capture-ledger に無かったら、型を名指したときに訊き直す）。null は capture-ledger に無い */
const hostTypes = async (asked) => {
  if (reading.types === undefined || (asked && reading.types === null)) {
    reading.types = (await find("/api/host-types")) ?? null;
  }
  return reading.types;
};

/**
 * 読む所を開く。何も名指さなければ（`#scripts`）一覧の頭を開き、URL をそれに替える（履歴は
 * 増やさない）。型は最初の 1 回だけ訊く（hostTypes）。
 */
const openReading = async (asked) => {
  const ticket = ++reading.ticket;
  const stale = () => ticket !== reading.ticket;
  IN_CATALOG.ask.hidden = true;
  IN_CATALOG.colors.hidden = true;
  try {
    await hostTypes(asked !== undefined && asked.id === undefined);
    if (stale()) return;
    let target = asked;
    if (target === undefined) {
      // 一覧の頭（対象サイトの無い物が先に並ぶ）
      const first = reading.latest.find((s) => s.enabled && s.sites.length === 0) ?? reading.latest[0];
      target = first !== undefined ? { id: first.id } : reading.types !== null ? {} : undefined;
      if (target !== undefined) history.replaceState(null, "", readingHash(target));
    }
    reading.hash = location.hash;
    drawReadingList();
    if (target === undefined) {
      reading.open = undefined;
      drawReadingHead(IN_CATALOG, { name: t("common.tab.scripts"), facts: [] });
      readingNote(IN_CATALOG, undefined);
      drawLines(IN_CATALOG, undefined);
      return;
    }
    if (target.id === undefined) openTypes(target, stale);
    else await openScript(target, stale);
  } catch (err) {
    if (!stale()) noteUnreadable(IN_CATALOG, err);
  }
};

/** 欄に書きかけがあるとき、置き換えるかを本文の上で訊く（at の所の中で）。 */
const askReplace = (at, doc, lines) => {
  const box = at.ask;
  box.hidden = false;
  box.replaceChildren(
    tag("span", t("scripts.replace.ask", { n: lines })),
    button(t("scripts.replace.yes"), () => {
      box.hidden = true;
      putTemplate(doc, { replace: true, at });
    }),
    button(t("scripts.replace.no"), () => {
      box.hidden = true;
    }),
  );
};

/**
 * スクリプトの 1 版を、その場の TS の欄に写して新しいクロールの画面へ移る。**書きかけを黙って消さない** —— 欄が空で
 * なければ、置き換えるかを本文の上で訊く（replace は「置き換える」を押したときだけ true。訊くのは at の所）。
 * 入れ方は「欄に戻す」（intoForm）と同じ。
 */
const putTemplate = (doc, { replace = false, at = IN_CATALOG } = {}) => {
  const box = $("start-inline-source");
  if (!replace && box.value.trim() !== "") {
    askReplace(at, doc, linesOf(box.value).length);
    return;
  }
  const name = $("start-inline-name").value.trim() || `my-${doc.id}`;
  const { source, changed } = asTemplate(doc.source, doc.id, name);
  $("start-inline-name").value = name;
  $(doc.phase === "preload" ? "start-inline-preload" : "start-inline-behavior").checked = true;
  box.value = source;
  // 元を外す。両方走ると 2 回走り、coverage は id を見ずに、先に走る方の報告を採る
  chosen.set(doc.id, false);
  catalogKey = undefined; // drawPicks は登録済みのスクリプトが変わったときだけ描くので、ここで描き直させる
  drawPicks(reading.latest);
  const said = $("start-answer");
  said.hidden = false;
  said.className = "start-answer muted";
  // 文と文の間は、言語の区切り（日本語は詰め、英語は空白）で繋ぐ
  said.textContent = [
    t("scripts.template.copied", { id: doc.id, version: doc.version }),
    changed.length === 0
      ? t("scripts.template.unchanged")
      : changed.length === 1
        ? t("scripts.template.changedLine", { line: changed[0], name })
        : t("scripts.template.changedLines", { lines: changed.join(t("common.sep.dot")), name }),
    t("scripts.template.unticked", { id: doc.id }),
    // その場の TS は対象サイトを持たない。スクリプトの冒頭の見分けが、ほかのサイトでは何もさせない
    ...(doc.sites.length === 0 ? [] : [t("scripts.template.sites", { sites: doc.sites.join(t("common.sep.dot")) })]),
  ].join(t("common.sep.sentence"));
  location.hash = "start";
  // 画面とタブを今出す —— 隠れた箱には focus が効かない（hashchange が画面を出すのは、この後）。
  // 読む窓は閉じない —— タブで元と見比べられる
  show("start");
  showStartTab("js");
  drawSource();
  syncStart();
  box.focus();
};

// ── 新しいクロールの読む窓 ─────────────────────────────────────────
/**
 * 新しいクロールの右の列で読んでいる物（スクリプトの 1 版か受け皿の型）。開けるのは 1 つで、別の「読む」で
 * 入れ替わる。target は readingHash の形（版つきのスクリプトの 1 版か、id の無い受け皿の型）。
 */
const startRead = { target: undefined, doc: undefined, ticket: 0 };
const IN_START = placeOf("start-read");

/** 描く所を空にする（見出し・本文の上の 1 行・色の 1 行・書きかけの確認・本文）。 */
const clearPlace = (at) => {
  at.head.replaceChildren();
  at.note.hidden = true;
  at.colors.hidden = true;
  at.ask.hidden = true;
  at.lines.replaceChildren();
};

/**
 * 右の列のタブ。**TS の箱は隠すだけ** —— 書きかけも、流した位置も、字の位置も残る（Chrome 152 で実測）。
 * 読む窓のタブと × は、何か開いている間だけ出る。
 */
const showStartTab = (tab) => {
  const open = startRead.target !== undefined;
  $("start-tab-read").hidden = !open;
  $("start-tab-close").hidden = !open;
  $("start-tab-rules").hidden = !following();
  $("start-tab-js").classList.toggle("on", tab === "js");
  $("start-tab-read").classList.toggle("on", tab === "read");
  $("start-tab-rules").classList.toggle("on", tab === "rules");
  $("start-js").hidden = tab !== "js";
  $("start-read").hidden = tab !== "read";
  $("start-rules").hidden = tab !== "rules";
};

/** 読む窓の見出し。名前はタブに在るので描かない（対象サイトは standing の文が言う）。 */
const drawStartReadHead = () => {
  const { target, doc } = startRead;
  const full = tag("a", t("start.read.openInCollection"));
  full.href = readingHash(target);
  if (target.id === undefined) {
    drawReadingHead(IN_START, { facts: metaOf(doc), actions: [copyButton(doc.source), full] });
    return;
  }
  const defaultVersion = defaultVersionOf(reading.latest, doc.id);
  drawReadingHead(IN_START, {
    facts: [...metaOf(doc), optionsText(doc.options)],
    standing: standingOf(doc, defaultVersion),
    actions: [copyButton(doc.source), button(t("scripts.actions.template"), () => putTemplate(doc, { at: IN_START })), full],
  });
};

/**
 * 右の列で読む。**移らない。** 中身と色はスクリプト集の画面と同じ覚え（docOf は id@版、colorsOf は sha256）を
 * 使うので、同じ版を 2 度は取らない。
 */
const readInStart = async (target) => {
  const ticket = ++startRead.ticket;
  const stale = () => ticket !== startRead.ticket;
  startRead.target = target;
  startRead.doc = undefined;
  $("start-tab-read").textContent = labelOf(target);
  clearPlace(IN_START);
  showStartTab("read");
  try {
    const sha = reading.latest.find((s) => s.id === target.id && s.version === target.version)?.sha256;
    const doc = target.id === undefined ? await hostTypes(true) : await docOf(target.id, target.version, sha);
    if (stale()) return;
    if (doc === null) {
      noteTypesMissing(IN_START);
      return;
    }
    startRead.doc = doc;
    drawStartReadHead();
    drawLines(IN_START, doc.source);
    void colorize(IN_START, doc, stale); // 1 色で読めるようにしてから、worker の答えを同じ行に塗る
  } catch (err) {
    if (!stale()) noteUnreadable(IN_START, err);
  }
};

/** 閉じる。遅れて届く答えは捨てる（番号を進める）。 */
const closeStartRead = () => {
  startRead.ticket++;
  startRead.target = undefined;
  startRead.doc = undefined;
  clearPlace(IN_START);
  showStartTab("js");
};

$("start-tab-js").onclick = () => showStartTab("js");
$("start-tab-rules").onclick = () => showStartTab("rules");
$("start-tab-read").onclick = () => showStartTab("read");
$("start-tab-close").onclick = () => closeStartRead();

// 「読む」（チェックの横と、注意書きの型）は、ふつうに押せば右の列で開く。修飾キーと中ボタンは
// ブラウザに任せる（href はスクリプト集の画面なので、別のタブで開ける）
$("start").addEventListener("click", (event) => {
  const a = event.target.closest("a[data-read]");
  if (a === null || !plainClick(event)) return;
  event.preventDefault();
  void readInStart(parseReading(a.getAttribute("href")));
});

// 読む窓の行を押すと印を付ける。URL は #start のまま（行を人に渡すのはスクリプト集の画面で）
IN_START.lines.addEventListener("click", (event) => {
  const li = event.target.closest("li");
  if (li !== null) markLine(IN_START, Number(li.dataset.n), { scroll: false });
});

// ── WACZ（1 本の中）────────────────────────────────────────────────
/**
 * wacz-validator の tui（`render/tree.ts`）と同じ入力から同じ木を組む（検証の報告の `entries`）。中身は `/wacz/` のエンドポイントに
 * **窓で**頼む —— 行の窓（200 行ずつ）、1 行を丸ごと（fields は daemon が割る）、
 * レコードの一覧（200 件ずつ）、1 レコード。窓の位置は workbench が持つ。一覧の上の warcinfo の枠は
 * 窓で頼まない —— 検証の報告の `warcinfo` に、欄と語彙まで載っている。
 */
const WINDOW = 200;

const wacz = {
  archive: undefined,
  report: undefined,
  rows: [],
  selected: undefined,
  /** 一覧のレコード（読んだ窓の合計）と、種別の絞り。 */
  records: undefined,
  hash: undefined,
};

const remember = (path, n) => {
  wacz.hash = waczHash(wacz.archive.id, path, n);
  // **hashchange を発火させずに** URL だけ替える（発火すると route が検証をやり直す）。
  history.replaceState(null, "", wacz.hash);
};

const drawWaczBar = (status) => {
  const bar = $("wacz-bar");
  bar.replaceChildren();
  const archive = wacz.archive;
  bar.append(
    tag("span", archive.sourceUrl, "mono"),
    tag("span", dateTime(new Date(archive.capturedAt)), "mono muted"),
  );
  if (status !== undefined) {
    bar.append(tag("span", status, "muted"));
    return;
  }
  const s = wacz.report.summary;
  const v = verdict(s);
  bar.append(
    tag("span", t("archives.report.passed", { n: s.passed }), "mono state ok"),
    tag("span", v.text, `mono state ${v.kind}`),
    tag(
      "span",
      `${judgedUnder(wacz.report).join(" · ")} · ${String(s.durationMs)} ms`,
      "mono muted",
    ),
  );
};

const drawTree = () => {
  const pre = $("wacz-tree");
  pre.replaceChildren();
  for (const row of wacz.rows) {
    const line = tag("span", row.connector + row.name, "trow");
    if (row.path === wacz.selected) line.classList.add("sel");
    const entry = row.entry;
    if (entry !== undefined && entry.present && entry.uncompressedSize !== undefined) {
      line.append(tag("span", `  ${formatBytes(entry.uncompressedSize)}`, "sz"));
    }
    const mark = entryMarker(entry);
    if (mark.glyph !== "") line.append(tag("span", `  ${mark.glyph}`, `mark ${mark.tone}`));
    if (entry !== undefined && entry.present) {
      line.classList.add("file");
      line.onclick = () => void selectEntry(row.path);
    }
    pre.append(line, document.createTextNode("\n"));
  }
};

/** この entry を指す指摘。`ReportEntry.issues` は rule と severity しか持たないので、報告側を突き合わせる。 */
const issuesOf = (path) => wacz.report.issues.filter((i) => i.location?.entry === path);

const drawHead = (entry, extra) => {
  const head = $("wacz-head");
  head.replaceChildren(
    tag("b", entry.path),
    tag("span", entry.uncompressedSize === undefined ? "" : formatBytes(entry.uncompressedSize)),
    tag("span", codecName(entry.compressionMethod)),
    tag("span", expectedLabel(entry.expectedBy, entry.expectedSection)),
  );
  for (const text of extra) head.append(tag("span", text));
  const issues = issuesOf(entry.path);
  head.append(
    issues.length === 0
      ? tag("span", t("wacz.head.noFindings"), "muted")
      : tag("span", t("wacz.head.findings", { n: issues.length }), "state warn"),
  );
  for (const issue of issues) {
    const line = document.createElement("div");
    line.className = "issue";
    line.append(
      tag("span", issue.severity, `state ${severityKind(issue.severity)}`),
      tag("span", issue.rule, "mono"),
      tag("span", issue.message),
    );
    head.append(line);
  }
};

/** 画面に入る。archive が変われば検証し直し、木を組み直す。同じなら選び直すだけ。 */
const openWacz = async ({ archiveId, path, n }) => {
  const archive = archives.find((a) => a.id === archiveId);
  if (archive === undefined) {
    trouble(t("wacz.archiveNotVisible", { id: archiveId }));
    location.hash = "archives";
    return;
  }
  show("wacz");
  $("tab-wacz").hidden = false;
  if (wacz.archive?.id !== archiveId) {
    wacz.archive = archive;
    wacz.report = undefined;
    wacz.rows = [];
    wacz.selected = undefined;
    wacz.records = undefined;
    wacz.hash = waczHash(archiveId);
    $("wacz-tree").replaceChildren();
    $("wacz-head").replaceChildren();
    $("wacz-content").replaceChildren();
    drawWaczBar(t("archives.check.asking"));
    try {
      wacz.report = await post(`/wacz/${enc(archiveId)}/validate?locale=${langOf()}`);
    } catch (err) {
      drawWaczBar(failedText(err));
      return;
    }
    drawWaczBar();
    wacz.rows = flattenTree(buildTree(wacz.report.entries));
    drawTree();
  }
  if (path !== undefined) await selectEntry(path, n);
};

const selectEntry = async (path, n) => {
  const entry = wacz.report.entries.find((e) => e.path === path);
  if (entry === undefined || !entry.present) return;
  wacz.selected = path;
  wacz.records = undefined;
  remember(path, n);
  drawTree();
  $("wacz-content").replaceChildren();
  try {
    if (isWarc(path)) {
      drawHead(entry, [t("wacz.head.recordList")]);
      await loadRecords(path, 0);
    } else {
      drawHead(entry, []);
      await loadLines(path, 0);
      if (n !== undefined) await openLine(path, n);
    }
  } catch (err) {
    $("wacz-content").append(tag("p", failedText(err), "state bad"));
  }
};

/** 行の窓を足す。`next` があれば「続きを読む」を残す。 */
const loadLines = async (path, from) => {
  const id = wacz.archive.id;
  const page = await api(`/wacz/${enc(id)}/lines?path=${enc(path)}&from=${String(from)}&count=${String(WINDOW)}`);
  if (wacz.selected !== path) return; // 読んでいる間に別の entry へ移った
  const content = $("wacz-content");
  let list = $("wacz-lines");
  if (list === null) {
    list = document.createElement("ol");
    list.id = "wacz-lines";
    list.className = "vlines";
    content.append(list);
    if (page.gunzipped) $("wacz-head").append(tag("span", t("wacz.head.gunzipped"), "muted"));
  }
  for (const line of page.lines) {
    const li = document.createElement("li");
    li.dataset.n = String(line.n);
    li.append(tag("span", String(line.n + 1), "n"), tag("span", lineLabel(line), line.binary ? "t muted" : "t"));
    li.onclick = () => void openLine(path, line.n);
    list.append(li);
  }
  $("wacz-more")?.remove();
  if (page.next !== null) {
    const more = button(t("wacz.lines.more", { from: page.next + 1, count: WINDOW }), () => {
      more.remove();
      void loadLines(path, page.next).catch((err) => content.append(tag("p", failedText(err), "state bad")));
    });
    more.id = "wacz-more";
    list.after(more);
  }
};

/** 1 行を丸ごと。fields は daemon が割ったもの —— こちらが付けた名前と、データが名乗った名前を色で分ける。 */
const openLine = async (path, n) => {
  const id = wacz.archive.id;
  for (const li of document.querySelectorAll("#wacz-lines li")) li.classList.toggle("sel", li.dataset.n === String(n));
  remember(path, n);
  const line = await api(`/wacz/${enc(id)}/line?path=${enc(path)}&n=${String(n)}`);
  if (wacz.selected !== path) return;
  const panel = document.createElement("div");
  panel.id = "wacz-line";
  panel.className = "vpart";
  const values = { n: n + 1, size: formatBytes(line.bytes) };
  const title = line.cut
    ? t("wacz.line.tagCut", values)
    : line.binary
      ? t("wacz.line.tagBinary", values)
      : t("wacz.line.tag", values);
  panel.append(tag("div", title, "vtag"));
  if (line.fields.length === 0) {
    panel.append(tag("pre", line.binary ? `(binary · ${formatBytes(line.bytes)})` : line.text, "vraw"));
  } else {
    const grid = document.createElement("div");
    grid.className = "vfields";
    for (const field of line.fields) {
      grid.append(tag("span", field.label, field.fromJson ? "k data" : "k"), tag("span", field.value, "v"));
    }
    panel.append(grid);
    const opener = recordOpener(line.fields);
    if (opener !== undefined) {
      panel.append(
        button(t("wacz.line.openRecord", { path: opener.path, offset: opener.offset, size: formatBytes(opener.length) }), () => {
          void openRecord(opener.path, opener.offset, opener.length).catch((err) =>
            panel.append(tag("p", failedText(err), "state bad")),
          );
        }),
      );
    }
  }
  const old = $("wacz-line");
  if (old !== null) old.replaceWith(panel);
  else ($("wacz-more") ?? $("wacz-lines")).after(panel);
  $("wacz-record")?.remove();
};

/** レコードの一覧の窓を足し、種別で絞れるようにする。 */
const loadRecords = async (path, from) => {
  const id = wacz.archive.id;
  const page = await api(`/wacz/${enc(id)}/records?path=${enc(path)}&from=${String(from)}&count=${String(WINDOW)}`);
  if (wacz.selected !== path) return;
  const prev = wacz.records ?? { rows: [], filter: undefined };
  wacz.records = { path, rows: [...prev.rows, ...page.records], next: page.next, total: page.total, filter: prev.filter };
  drawRecords();
};

/**
 * warcinfo の記録 1 件の枠。名前と値は WARC が書いたまま。3 列目は、名前が Dublin Core の語か WARC 1.1 の
 * warcinfo の欄かを検証器が決めた表示名で、その定義へリンクする。どちらでもない名前（作り手が決めた名前）は空。
 */
const warcinfoPanel = (record) => {
  const panel = document.createElement("div");
  panel.className = "vpart";
  panel.append(tag("div", warcinfoTag(record), "vtag"));
  const note = warcinfoNote(record);
  if (note !== undefined) {
    panel.append(tag("span", note, "muted"));
    return panel;
  }
  const grid = document.createElement("div");
  grid.className = "vfields vocab";
  for (const field of record.fields) {
    grid.append(
      tag("span", field.name, "k data"),
      tag("span", field.value, "v"),
      field.ref === undefined || field.label === undefined ? tag("span", "") : link(field.ref, `${field.label} ↗`),
    );
  }
  panel.append(grid);
  return panel;
};

const drawRecords = () => {
  const { rows, next, total, filter, path } = wacz.records;
  const content = $("wacz-content");
  content.replaceChildren();

  // その本の warcinfo。報告が持っていなければ（本に無い・古い daemon）枠を出さない
  for (const record of warcinfoOf(wacz.report, path)) content.append(warcinfoPanel(record));

  // 種別の絞り。数は読んだ窓の中の数（全体の数は total）。
  const counts = new Map();
  for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  const chips = document.createElement("div");
  chips.className = "chips";
  const chip = (label, value) => {
    const b = button(label, () => {
      wacz.records.filter = value;
      drawRecords();
    });
    b.className = "chip" + (filter === value ? " on" : "");
    return b;
  };
  const values = { shown: rows.length, total };
  chips.append(chip(next === null ? t("wacz.records.all", values) : t("wacz.records.allMore", values), undefined));
  for (const [type, count] of counts) chips.append(chip(t("wacz.records.typeCount", { type: typeName(type), n: count }), type));
  chips.append(tag("span", t("wacz.records.legend"), "muted mono"));
  content.append(chips);

  const table = document.createElement("table");
  table.className = "vrecords";
  const head = document.createElement("tr");
  for (const text of ["", t("wacz.records.col.type"), t("wacz.records.col.status"), "content-type", "URI"]) head.append(tag("th", text));
  table.append(head);
  for (const row of rows) {
    if (filter !== undefined && row.type !== filter) continue;
    const cells = recordCells(row);
    const tr = document.createElement("tr");
    tr.append(
      cell(cells.indexed ? "▪" : "▫", "mono mark"),
      cell(cells.type),
      cell(cells.status, "mono num"),
      cell(cells.mime, "mono"),
      cell(cells.uri, "mono wide"),
    );
    tr.className = "head";
    tr.onclick = () => {
      for (const other of table.querySelectorAll("tr")) other.classList.toggle("sel", other === tr);
      void openRecord(path, row.offset, row.length).catch((err) => content.append(tag("p", failedText(err), "state bad")));
    };
    table.append(tr);
  }
  content.append(table);
  if (next !== null) {
    content.append(
      button(t("wacz.records.more", { from: next + 1, count: WINDOW, total }), () => {
        void loadRecords(path, next).catch((err) => content.append(tag("p", failedText(err), "state bad")));
      }),
    );
  }
};

/** 1 レコード。見出しは文字、本文は text / raster の画像 / 大きさだけ。 */
const openRecord = async (path, offset, length) => {
  const id = wacz.archive.id;
  const query = `path=${enc(path)}&offset=${String(offset)}&length=${String(length)}`;
  const record = await api(`/wacz/${enc(id)}/record?${query}`);
  const panel = document.createElement("div");
  panel.id = "wacz-record";
  panel.className = "vpart";
  panel.append(tag("div", t("wacz.record.tag", { path, offset, size: formatBytes(length) }), "vtag"));
  panel.append(tag("pre", record.warc.map((h) => `${h.name}: ${h.value}`).join("\n"), "vraw"));
  if (record.http !== undefined) {
    panel.append(
      tag("pre", [record.http.status, ...record.http.headers.map((h) => `${h.name}: ${h.value}`)].join("\n"), "vraw"),
    );
  }
  const body = record.body;
  if (body.kind === "text") {
    panel.append(tag("pre", body.content, "vraw body"));
    if (body.truncated) panel.append(tag("span", bodyLabel(body), "muted"));
  } else if (body.kind === "image") {
    // raster だけ。daemon が 415 で断るものはここに来ない。src は GET なので、署名は毎回サーバがもらう。
    const img = document.createElement("img");
    img.src = `/wacz/${enc(id)}/record/body?${query}`;
    img.alt = bodyLabel(body);
    img.className = "vimg";
    panel.append(img, tag("span", bodyLabel(body), "muted mono"));
  } else {
    panel.append(tag("span", bodyLabel(body), "muted mono"));
  }
  const old = $("wacz-record");
  if (old !== null) old.replaceWith(panel);
  else $("wacz-content").append(panel);
  panel.scrollIntoView({ block: "nearest" });
};

// ── 定期実行 ───────────────────────────────────────────────────────
/**
 * 走ったままの行を締めるときに capture-ledger へ送る理由。**保存されるデータになる**（クロールの行の `error`）ので、
 * 画面の言語の文ではなく、決まった英語の句を送る。出す所（開いた行の失敗の文・回の表）が、辞書の
 * `crawls.reason.<句>` で訳す（`phraseText`）。句を言い換えると、前に保存した行が訳されなくなる。
 */
const CLOSE_REASON_KEY = key("crawls.reason.closed from the schedules view");
const CLOSE_REASON = CLOSE_REASON_KEY.slice("crawls.reason.".length);

/**
 * 最後に読めた予定。**一覧の引き直しと別の輪で読む** —— `refresh` の `Promise.all` は 1 つ落ちると描画を全部飛ばすので、
 * ここが落ちてクロールの表まで止まらないように。読めなければ帯で言う（読めないことを正常と取り違えない）。
 */
let schedules = [];
let schedulesError;
let schedulesTimer;
/** `api()` と違って時間を切る。答えない capture-ledger を待ち続けると、帯も出ない。 */
const SCHEDULES_TIMEOUT_MS = 15_000;

const drawBand = () => {
  const lines = [bandOf(schedules, schedulesError), ...changeBandLines(schedules)].filter((line) => line !== undefined);
  const said = lines.length === 0 ? undefined : lines.join(t("common.sep.slash"));
  $("schedule-band").hidden = said === undefined;
  if (said !== undefined) $("schedule-band-text").textContent = said;
  const trouble = troubleCount(schedules);
  $("tab-schedules-count").hidden = trouble === 0;
  $("tab-schedules-count").textContent = String(trouble);
};

/** 操作を頼み、答えを 1 行で出して、引き直す。走る物が変わるので、クロールの表も引き直す。 */
const scheduleAction = async (action, path, { ask, body } = {}) => {
  if (ask !== undefined && !window.confirm(ask)) return;
  const { status, answer } = await postJson(path, body);
  const said = actionAnswer(action, status, answer);
  const line = $("schedules-answer");
  line.hidden = false;
  line.className = `start-answer state ${said.kind}`;
  line.textContent = said.text;
  await Promise.all([refreshSchedules(), refresh()]);
};

const scheduleButtons = (schedule) => {
  const path = (action) => `${SCHEDULES_PATH}/${schedule.id}/${action}`;
  const box = document.createElement("div");
  box.className = "schedule-actions";
  box.append(button(t("schedules.action.run"), () => void scheduleAction("run", path("run"))));
  box.append(
    schedule.enabled
      ? button(t("schedules.action.pause"), () => void scheduleAction("pause", path("pause")))
      : button(t("schedules.action.resume"), () => void scheduleAction("resume", path("resume"))),
  );
  box.append(button(t("schedules.action.repin"), () => void scheduleAction("repin", path("repin"))));
  box.append(
    button(t("schedules.action.delete"), () =>
      void scheduleAction("delete", path("delete"), {
        ask: t("schedules.ask.delete", { name: schedule.name }),
      }),
    ),
  );
  const crawlId = closableCrawl(schedule);
  if (crawlId !== undefined) {
    const id = crawlId.slice(0, 8);
    box.append(
      button(t("schedules.action.close", { id }), () =>
        void scheduleAction("close", `/api/crawls/${crawlId}/failed`, {
          ask: t("schedules.ask.close", { id }),
          body: { reason: CLOSE_REASON },
        }),
      ),
    );
  }
  return box;
};

/** 回の 1 行。id はクロールの画面へ（印を付けて開く）。 */
const scheduleRunRow = (run, timeZone) => {
  const row = document.createElement("tr");
  const said = runResult(run);
  row.append(cell(said.text, `state ${said.kind}`));
  row.append(cell(runWhen(run, timeZone), "mono"));
  row.append(cell(shortTime(run.startedAt, timeZone), "mono"));
  row.append(cell(runDelay(run)));
  row.append(cell(runMissed(run)));
  row.append(cell(phraseText("crawls.reason", run.error ?? ""), "wide"));
  // 前回からの変化（CAPTURE-167）。比べた回はタブ「変化」のその回へ
  const change = changeOf(run.change);
  if (run.change === null || run.change === undefined) {
    row.append(cell(change.text, "muted"));
  } else {
    const changed = hashCell(`#changes/${run.crawlId}`, change.text);
    changed.className = `state ${change.kind}`;
    if (run.change.headline) changed.title = run.change.headline;
    row.append(changed);
  }
  const id = hashCell("#crawls", run.crawlId.slice(0, 8));
  id.className = "mono";
  id.querySelector("a").onclick = () => {
    spotlight = run.crawlId;
    drawCrawls();
  };
  row.append(id);
  return row;
};

const drawSchedules = () => {
  const box = $("schedules");
  box.replaceChildren();
  $("schedules-empty").hidden = schedules.length > 0 || schedulesError !== undefined;
  for (const schedule of schedules) {
    const card = document.createElement("article");
    card.className = "schedule";
    const head = document.createElement("h2");
    head.append(tag("span", schedule.name));
    const health = healthOf(schedule);
    head.append(tag("span", health.text, `state ${health.kind}`));
    card.append(head);
    card.append(
      tag(
        "p",
        t("schedules.card.meta", {
          cron: cronWords(schedule.cron),
          timezone: schedule.timezone,
          next: shortTime(schedule.nextRunAt, schedule.timezone),
          seeds: schedule.seeds.length,
          depth: String(schedule.maxDepth),
          scripts: scriptsText(schedule),
        }),
        "schedule-meta",
      ),
    );
    card.append(scheduleButtons(schedule));
    if (schedule.recentRuns.length > 0) {
      const table = document.createElement("table");
      const titles = document.createElement("tr");
      const columns = [
        t("schedules.col.result"),
        t("schedules.col.due"),
        t("schedules.col.started"),
        t("schedules.col.delay"),
        t("schedules.col.missed"),
        t("schedules.col.reason"),
        t("schedules.col.change"),
        "id",
      ];
      for (const title of columns) titles.append(tag("th", title));
      const thead = document.createElement("thead");
      thead.append(titles);
      const tbody = document.createElement("tbody");
      for (const run of schedule.recentRuns) tbody.append(scheduleRunRow(run, schedule.timezone));
      table.append(thead, tbody);
      card.append(table);
    } else {
      card.append(tag("p", t("schedules.card.noRuns"), "empty"));
    }
    box.append(card);
  }
};

const refreshSchedules = async () => {
  clearTimeout(schedulesTimer);
  try {
    const res = await fetch(SCHEDULES_PATH, { signal: AbortSignal.timeout(SCHEDULES_TIMEOUT_MS) });
    const body = await res.json();
    if (!res.ok) throw new Error(errorText(body) ?? `${SCHEDULES_PATH} → ${String(res.status)}`);
    schedules = body.schedules;
    schedulesError = undefined;
  } catch (err) {
    schedulesError = failedText(err);
  }
  drawSchedules();
  drawBand();
  schedulesTimer = setTimeout(() => void refreshSchedules(), pollMs(schedules));
};

// ── 前回からの変化（CAPTURE-167・目次と 1 ページは CAPTURE-236） ──────────────────────────
/**
 * いま開いている回。`crawlId` が替わったときだけ回の答えを読み、ページを替えても読み直さない。`detail` が undefined の
 * 間は読んでいる途中（遅れて届いた前の回の答えは捨てる）。一覧（`#changes`）を開くと消える。
 */
let changesView = { crawlId: undefined, detail: undefined, toc: [] };

/** 狭い窓（目次が上・ページが下）。app.css の切り替えと同じ幅。 */
const NARROW = "(max-width: 760px)";

/**
 * 差分の表。**DOM で組む**（public/ では HTML を差し込まない）。塊は 1 つの表に並べ、塊の境に「⋯」の行。印の列は字と
 * 分けた帯。引用された行（`quoted`）に印を付け、引用のボタンから行へ動けるように行を返す。
 */
const changeDiffOf = (hunks, quotedAt) => {
  const box = document.createElement("div");
  box.className = "diff change-diff";
  const lines = document.createElement("table");
  lines.className = "difflines";
  const rows = new Map();
  for (const [h, hunk] of hunks.entries()) {
    if (h > 0) {
      const gap = document.createElement("tr");
      gap.className = "gap";
      const td = cell("⋯", "mono");
      td.colSpan = 2;
      gap.append(td);
      lines.append(gap);
    }
    for (const [l, line] of hunkLines(hunk).entries()) {
      const row = document.createElement("tr");
      row.className = line.sign === "-" ? "del" : line.sign === "+" ? "add" : "context";
      if (quotedAt.has(`${String(h)}:${String(l)}`)) row.classList.add("quoted");
      row.append(cell(line.sign, "mono sign"), cell(line.text, "mono code"));
      rows.set(`${String(h)}:${String(l)}`, row);
      lines.append(row);
    }
  }
  box.append(lines);
  return { box, rows };
};

const drawChangeList = (runs) => {
  const tbody = $("changes-rows");
  tbody.replaceChildren();
  $("changes-empty").hidden = runs.length > 0;
  $("changes-table").hidden = runs.length === 0;
  for (const run of runs) {
    const row = document.createElement("tr");
    row.append(cell(run.scheduleName ?? run.scheduleId.slice(0, 8)));
    // 並びは始まった順なので、始まった時刻で言う（遅れた回にだけ本来の時刻。CAPTURE-235）
    row.append(cell(runTimeText(run), "mono"));
    const said = changeOf(run);
    const changed = hashCell(changesHash(run.crawlId), said.text);
    changed.className = `state ${said.kind}`;
    row.append(changed);
    row.append(cell(run.restricted ? t("changes.list.restricted") : (run.headline ?? ""), "wide"));
    tbody.append(row);
  }
};

/** 前と今を 2 つの再生で開く link（CAPTURE-102）。4 本になるので、数の行とは分けて 1 行に置く。 */
const replayLinksOf = (page) => {
  const opens = document.createElement("p");
  opens.className = "muted";
  for (const [when, ref] of [[t("changes.page.before"), page.before], [t("changes.page.after"), page.after]]) {
    if (ref === null || ref === undefined) continue;
    if (opens.childNodes.length > 0) opens.append(t("changes.sep.dot"));
    opens.append(when);
    for (const viewer of VIEWERS) {
      opens.append(" ", link(replaywebHref(settings[viewer.setting], ref), viewerText(viewer)));
    }
  }
  return opens;
};

/** 前のページ・何番目か・次のページ。「同じ」を開いているときは番号を言わない。 */
const changeStepsOf = (crawlId, toc, row) => {
  const near = neighborsOf(toc, row);
  const steps = document.createElement("p");
  steps.className = "change-steps";
  const step = (to, text) => {
    if (to === undefined || to.id === null) return tag("span", text, "muted");
    const a = document.createElement("a");
    a.href = changesHash(crawlId, to.id);
    a.textContent = text;
    return a;
  };
  steps.append(step(near.prev, t("changes.steps.prev")));
  if (near.index !== undefined) steps.append(tag("span", `${String(near.index)} / ${String(near.total)}`, "muted"));
  steps.append(step(near.next, t("changes.steps.next")));
  return steps;
};

/** 右の 1 ページ。差分の在るページ・同じだったページ・何も無い回の 3 つ。 */
const drawChangePane = (detail, toc, picked) => {
  const pane = $("change-pane");
  pane.replaceChildren();
  const row = picked.row;
  if (picked.missing) pane.append(tag("p", t("changes.pane.missing"), "state bad"));
  if (row === undefined) {
    pane.append(
      tag(
        "p",
        toc.length === 0 ? t("changes.pane.noPages") : t("changes.pane.allSame"),
        "empty",
      ),
    );
    return;
  }
  const title = document.createElement("h3");
  title.append(tag("span", row.text, `state ${row.kind}`), tag("span", row.url, "mono"));
  pane.append(title);
  pane.append(changeStepsOf(detail.crawlId, toc, row));
  const page = row.page;
  if (row.same) {
    pane.append(tag("p", t("changes.pane.same")));
    pane.append(replayLinksOf(page));
    return;
  }
  const meta = document.createElement("p");
  meta.className = "muted";
  const lines = { added: page.added, removed: page.removed };
  const note = versionNote(page);
  meta.append(note === "" ? t("changes.pane.lines", lines) : t("changes.pane.linesNoted", { ...lines, note }));
  pane.append(meta, replayLinksOf(page));
  if (page.headline !== null) {
    pane.append(tag("p", pageClaudeLine(page.headline)));
    // Claude の 1 行は日本語のまま届く。日本語でない画面にだけ、そう断る
    const japanese = japaneseNote();
    if (japanese !== undefined) pane.append(tag("p", japanese, "muted"));
  }
  if (page.state === "prev_missing") {
    pane.append(tag("p", t("changes.pane.prevMissing"), "state bad"));
    return;
  }
  // 引用は、それを含む差分の行に結ぶ。押すとその行へ動く（照合で外れた引用はボタンにしない）
  const quoted = page.quotes.map((quote) => (quote.verified ? quoteLineOf(page.hunks, quote.text) : undefined));
  const at = (pos) => `${String(pos.hunk)}:${String(pos.line)}`;
  const diff = changeDiffOf(page.hunks, new Set(quoted.filter((pos) => pos !== undefined).map(at)));
  if (page.quotes.length > 0) {
    const quotes = document.createElement("p");
    quotes.className = "change-quotes";
    quotes.append(tag("span", t("changes.quotes.label"), "muted"));
    for (const [i, quote] of page.quotes.entries()) {
      const pos = quoted[i];
      if (pos === undefined) {
        const said = { text: quote.text };
        quotes.append(
          quote.verified
            ? tag("span", t("changes.quotes.quote", said), "muted")
            : tag("span", t("changes.quotes.notInDiff", said), "state bad"),
        );
        continue;
      }
      quotes.append(
        button(t("changes.quotes.quote", { text: quote.text }), () => {
          const line = diff.rows.get(at(pos));
          for (const hit of pane.querySelectorAll("tr.hit")) hit.classList.remove("hit");
          line?.classList.add("hit");
          line?.scrollIntoView({ block: "center" });
        }),
      );
    }
    pane.append(quotes);
  }
  pane.append(diff.box);
};

/** 目次。押すと hash を書く（ブラウザの戻るで 1 つ前のページへ）。 */
const drawChangeToc = (detail, toc, row) => {
  const box = $("change-toc");
  box.replaceChildren();
  box.append(tag("h3", t("changes.toc.title", { n: detail.pagesCompared })));
  const list = document.createElement("ol");
  for (const entry of toc) {
    const li = document.createElement("li");
    // 1 行目に重さと数、2 行目に URL
    const label = [tag("span", entry.text, entry.same ? "muted" : `state ${entry.kind}`)];
    if (!entry.same) label.push(tag("span", `+${String(entry.page.added)} −${String(entry.page.removed)}`, "muted mono"));
    const url = tag("span", entry.url.replace(/^https?:\/\//, ""), "mono toc-url");
    if (entry.id === null) {
      li.append(...label, url);
    } else {
      const a = document.createElement("a");
      a.href = changesHash(detail.crawlId, entry.id);
      a.append(...label, url);
      if (entry === row) a.setAttribute("aria-current", "page");
      li.append(a);
    }
    list.append(li);
  }
  box.append(list);
};

/** 回の頭（見出し・比べた 2 回の時刻・要約）。回が替わったときだけ描く。 */
const drawChangeHead = (detail) => {
  const head = $("change-head");
  head.replaceChildren();
  const back = document.createElement("p");
  back.className = "change-back";
  const toList = document.createElement("a");
  toList.href = "#changes";
  toList.textContent = t("changes.head.back");
  back.append(toList);
  head.append(back);
  const h2 = document.createElement("h2");
  h2.append(tag("span", detail.scheduleName ?? t("changes.head.noName")));
  const said = changeOf(detail);
  h2.append(tag("span", said.text, `state ${said.kind}`));
  head.append(h2);
  // 比べた 2 回。前の回の時刻は v0.95.0 より前の capture-ledger には無い
  const now = runTimeText(detail);
  const runs = detail.prev?.startedAt
    ? t("changes.head.runs", { now, prev: runTimeText(detail.prev) })
    : t("changes.head.run", { now });
  head.append(tag("p", runs, "change-runs mono"));
  head.append(tag("p", summaryLine(detail.summary), "muted"));
  if (detail.headline) head.append(tag("p", detail.headline, "change-headline"));
  if (detail.error) head.append(tag("p", detail.error, "state bad"));
  if (detail.restricted) head.append(tag("p", t("changes.head.restricted"), "muted"));
};

/** 回の答えから、頭・目次・右のページを描く。`pageId` だけが替わったときは目次の印と右のページだけ。 */
const drawChangeDetail = (pageId, { fresh }) => {
  const { detail, toc } = changesView;
  const body = $("change-body");
  if (fresh) drawChangeHead(detail);
  if (detail.state === "no_previous") {
    body.hidden = true;
    if (fresh) $("change-head").append(tag("p", t("changes.head.noPrevious"), "empty"));
    return;
  }
  body.hidden = false;
  const picked = pickPage(toc, pageId);
  drawChangeToc(detail, toc, picked.row);
  drawChangePane(detail, toc, picked);
  // 狭い窓では目次の下にページが来るので、ページを替えたらその頭へ。回を開いたときは回の頭へ
  if (fresh) {
    if ($("change-detail").getBoundingClientRect().top < 0) $("change-detail").scrollIntoView({ block: "start" });
  } else if (window.matchMedia(NARROW).matches) {
    $("change-pane").scrollIntoView({ block: "start" });
  }
};

const changesAnswer = (text) => {
  const line = $("changes-answer");
  line.hidden = text === undefined;
  if (text !== undefined) {
    line.className = "start-answer state bad";
    line.textContent = text;
  }
};

/**
 * タブ「変化」を開いたときに引く（一覧の引き直しの輪には入れない。毎朝 1 回しか変わらない）。一覧（`#changes`）を
 * 開くと一覧を読み、回を開くと一覧を隠して回の答えを 1 度だけ読む。
 */
const openChanges = async (crawlId, pageId) => {
  $("changes-list").hidden = crawlId !== undefined;
  if (crawlId === undefined) {
    changesView = { crawlId: undefined, detail: undefined, toc: [] };
    $("change-detail").hidden = true;
    try {
      const res = await fetch(CHANGES_PATH);
      const body = await res.json();
      signInAgain(res, body);
      if (!res.ok) throw new Error(changesError(res.status, body));
      drawChangeList(body.runs);
      changesAnswer(undefined);
    } catch (err) {
      changesAnswer(failedText(err));
    }
    return;
  }
  if (changesView.crawlId === crawlId) {
    if (changesView.detail !== undefined) drawChangeDetail(pageId, { fresh: false });
    else changesView.pageId = pageId; // 読んでいる途中。届いたら最後に名指したページを出す
    return;
  }
  changesView = { crawlId, detail: undefined, toc: [], pageId };
  $("change-detail").hidden = true;
  try {
    const one = await fetch(changeDetailPath(crawlId));
    const detail = await one.json();
    signInAgain(one, detail);
    if (!one.ok) throw new Error(changesError(one.status, detail));
    if (changesView.crawlId !== crawlId) return; // 別の回を開いた
    changesView = { crawlId, detail, toc: tocOf(detail), pageId: changesView.pageId };
    $("change-detail").hidden = false;
    drawChangeDetail(changesView.pageId, { fresh: true });
    changesAnswer(undefined);
  } catch (err) {
    if (changesView.crawlId === crawlId) changesAnswer(failedText(err));
  }
};

// ── リンクの構成（#links/<クロールの id>[/<ページの id>]・CAPTURE-246） ─────────────
/**
 * クロール 1 本のリンクの構成。capture-ledger が残したリンクの記録（`GET /api/crawls/:id/links`）を、深さを列にした
 * 図に描く。**数も「どうなったか」も capture-ledger の物で、ここは描くだけ** —— 配置と字は `public/links.js`。
 *
 *   crawl      クロールの 1 本の答え（起点・状態・上限）
 *   graph      リンクの構成の答え。読んでいる間は undefined
 *   collapsed  畳んだページの id
 *   pageId     選んだページ（無ければ undefined）
 *   cross      木に無い辺を全部出すか
 *   pages      選んだページの出入りのリンクの答え（ページの id → 答え・読めなければ Error）
 *   timer      走っているクロールの引き直し
 */
let linksView = { crawlId: undefined };

const SVG_NS = "http://www.w3.org/2000/svg";
const svgTag = (name, attrs = {}, text) => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
};

const linksAnswer = (text) => {
  $("links-answer").hidden = text === undefined;
  $("links-answer").textContent = text ?? "";
};

const drawLinksHead = () => {
  const { crawl, crawlId, graph } = linksView;
  const head = $("links-head");
  head.replaceChildren();
  const back = document.createElement("p");
  back.className = "change-back";
  const toList = document.createElement("a");
  toList.href = "#crawls";
  toList.textContent = t("links.back");
  back.append(toList);
  head.append(back);
  const h2 = document.createElement("h2");
  h2.append(tag("span", t("links.title")), tag("span", crawlId.slice(0, 8), "mono"));
  if (crawl !== undefined) {
    const said = stateOf(crawl);
    h2.append(tag("span", crawl.seeds[0] ?? "", "wide"), tag("span", said.text, `state ${said.kind}`));
  }
  head.append(h2);
  if (crawl !== undefined) {
    // 欄の無い答え（古い capture-ledger）は、その項を書かない
    const facts = [
      typeof crawl.pagesCaptured === "number" ? t("links.facts.captured", { n: count(crawl.pagesCaptured) }) : undefined,
      typeof crawl.maxDepth === "number" ? t("links.facts.maxDepth", { n: crawl.maxDepth }) : undefined,
      typeof crawl.maxPages === "number" ? t("links.facts.maxPages", { n: count(crawl.maxPages) }) : undefined,
    ].filter((fact) => fact !== undefined);
    head.append(tag("p", facts.join(t("common.sep.dot")), "links-facts"));
  }
  if (graph !== undefined && !graph.recorded) {
    head.append(tag("p", t("links.notRecorded"), "state warn"));
  }
};

/**
 * 内訳の 1 項（見出しと数）。`b` は、数を包む物 —— 凡例では要素（太字）、読み上げの字では字のまま。
 */
const splitItem = (part, b) => tNodes("links.split.item", { text: part.text, n: count(part.n), b });

const drawLinksSplit = () => {
  const box = $("links-split");
  box.replaceChildren();
  const { parts, total, aside } = splitOf(linksView.graph?.summary);
  if (parts.length === 0) return;
  // 英語で単数と複数を分ける文には、数のまま渡す（桁は辞書の `{n, number}` が区切る）。分けない文には `count()` の字を渡す
  box.append(tag("p", t("links.split.title", { n: total }), "links-split-title"));
  const bar = document.createElement("div");
  bar.className = "links-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    parts.map((part) => splitItem(part, (text) => text).join("")).join(t("common.sep.comma")),
  );
  const legend = document.createElement("div");
  legend.className = "links-legend";
  for (const part of parts) {
    const seg = tag("span", "", part.kind);
    seg.style.flex = String(part.n);
    bar.append(seg);
    const item = document.createElement("span");
    item.append(tag("i", "", part.kind), ...splitItem(part, (text) => tag("b", text)));
    legend.append(item);
  }
  if (aside !== undefined) legend.append(tag("span", aside, "muted"));
  box.append(bar, legend);
};

/** 選んだページを替える。URL は hashchange を発火させずに替える（発火すると route が読み直す）。 */
const pickLinksPage = (pageId) => {
  linksView.pageId = pageId;
  history.replaceState(null, "", linksHash(linksView.crawlId, pageId));
  drawLinksGraph();
  drawLinksPanel();
  if (pageId !== undefined) void loadLinksPage(pageId);
};

const drawLinksGraph = () => {
  const { graph, collapsed, pageId, cross } = linksView;
  const host = $("links-graph");
  if (graph === undefined) {
    host.replaceChildren();
    return;
  }
  const layout = layoutOf(graph, collapsed);
  const index = indexOf(graph);
  const origin = originOf(graph);
  const at = new Map(layout.rows.map((row) => [row.key, row]));
  const hosts = graph.hosts ?? [];
  const width = colX(layout.depth) + SIZE.col + 12;
  const height = layout.height + (hosts.length > 0 ? 8 : 0);
  const root = svgTag("svg", {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    width,
    height,
    role: "img",
    "aria-label": t("links.graph.label", { n: graph.pages.length }),
  });
  if (pageId !== undefined) root.classList.add("dim");
  const defs = svgTag("defs");
  const marker = svgTag("marker", { id: "lg-arrow", viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: "auto" });
  marker.append(svgTag("path", { d: "M0,0 L8,4 L0,8 z", class: "lg-head" }));
  defs.append(marker);
  root.append(defs);
  const maxDepth = linksView.crawl?.maxDepth;
  for (let depth = 0; depth <= layout.depth; depth += 1) {
    const text =
      depth === 0
        ? t("links.graph.depthSeeds")
        : maxDepth !== undefined && depth > maxDepth
          ? t("links.graph.depthBeyond", { depth })
          : t("links.graph.depth", { depth });
    root.append(svgTag("text", { x: colX(depth), y: 16, class: "lg-h" }, text));
  }
  const mid = (row) => row.y + SIZE.node / 2;
  const curve = (x1, y1, x2, y2) => {
    const m = (x1 + x2) / 2;
    return `M${String(x1)},${String(y1)} C${String(m)},${String(y1)} ${String(m)},${String(y2)} ${String(x2)},${String(y2)}`;
  };
  const touches = (a, b) => pageId !== undefined && (a === pageId || b === pageId);
  // 木の辺（見つけた道）と、束への辺
  for (const row of layout.rows) {
    const from = at.get(row.kind === "page" ? (index.byId.get(row.id).parent ?? "") : row.from);
    if (from === undefined) continue;
    const kind = row.kind === "page" ? "" : ` cut ${linkOutcomeOf(row.outcome).kind}`;
    const hi = touches(from.id, row.kind === "page" ? row.id : undefined) ? " hi" : "";
    root.append(
      svgTag("path", {
        d: curve(colX(from.depth) + SIZE.col, mid(from), colX(row.depth), mid(row)),
        class: `lg-e${kind}${hi}`,
      }),
    );
  }
  // 木に無い辺（もう行があるページへのリンク）
  let lane = 0;
  for (const [fromId, toId] of crossOf(graph, layout, pageId, cross)) {
    const a = at.get(fromId);
    const b = at.get(toId);
    let d;
    if (b.depth > a.depth) d = curve(colX(a.depth) + SIZE.col, mid(a), colX(b.depth), mid(b));
    else if (b.depth === a.depth) {
      const bend = colX(a.depth) + SIZE.col + 14 + (lane++ % 4) * 7;
      d = `M${String(colX(a.depth) + SIZE.col)},${String(mid(a))} C${String(bend)},${String(mid(a))} ${String(bend)},${String(mid(b))} ${String(colX(b.depth) + SIZE.col + 2)},${String(mid(b))}`;
    } else d = curve(colX(a.depth), mid(a), colX(b.depth) + SIZE.col + 2, mid(b));
    root.append(
      svgTag("path", { d, class: `lg-x${touches(fromId, toId) ? " hi" : ""}`, "marker-end": "url(#lg-arrow)" }),
    );
  }
  const keyed = (el, act) => {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.addEventListener("click", act);
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      act();
    });
  };
  for (const row of layout.rows) {
    const x = colX(row.depth);
    if (row.kind === "bundle") {
      const said = linkOutcomeOf(row.outcome);
      const g = svgTag("g", { class: `lg-b ${said.kind}` });
      g.append(
        svgTag("rect", { x, y: row.y, width: SIZE.col, height: SIZE.node, rx: 8 }),
        svgTag("text", { x: x + 8, y: row.y + 12.5 }, bundleText(row.outcome, row.urls)),
      );
      // 束を押すと、見つけたページを選ぶ（下に、そのページのリンクが 1 本ずつ出る）
      keyed(g, () => pickLinksPage(row.from));
      root.append(g);
      continue;
    }
    const page = index.byId.get(row.id);
    const g = svgTag("g", { class: `lg-n ${pageKind(page.state)}${pageId === row.id ? " sel" : ""}` });
    const label = row.folded
      ? t("links.box.folded", { label: boxLabelOf(page.url, origin, 13), n: count(row.hidden) })
      : boxLabelOf(page.url, origin, row.foldable ? 21 : 24);
    g.append(
      svgTag("rect", { x, y: row.y, width: SIZE.col, height: SIZE.node, rx: 4 }),
      svgTag("text", { x: x + 6, y: row.y + 12.5 }, label),
      svgTag(
        "title",
        {},
        page.title
          ? t("links.box.titleNamed", { url: page.url, title: page.title, outcome: outcomeOfPage(page) })
          : t("links.box.title", { url: page.url, outcome: outcomeOfPage(page) }),
      ),
    );
    keyed(g, () => pickLinksPage(pageId === row.id ? undefined : row.id));
    if (row.foldable) {
      const toggle = svgTag("text", { x: x + SIZE.col - 13, y: row.y + 12.5, class: "lg-tog" }, row.folded ? "▸" : "▾");
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!linksView.collapsed.delete(row.id)) linksView.collapsed.add(row.id);
        drawLinksGraph();
      });
      g.append(toggle);
    }
    root.append(g);
  }
  if (hosts.length > 0) {
    const skipped = hosts.reduce((n, one) => n + one.urls, 0);
    const x = colX(Math.min(1, layout.depth));
    const g = svgTag("g", { class: "lg-b muted" });
    g.append(
      svgTag("rect", { x, y: height - 30, width: Math.min(SIZE.col + 100, width - x - 12), height: SIZE.node + 1, rx: 8 }),
      svgTag("text", { x: x + 8, y: height - 17 }, t("links.box.hosts", { urls: skipped, hosts: hosts.length })),
    );
    root.append(g);
  }
  host.replaceChildren(root);
};

/**
 * 束の箱の字。箱の幅（`SIZE.col`）は言語で変えないので、英語は結末の字（`linkOutcomeOf`）より短い形を辞書に
 * 置いてある。束になる結末は 3 つ。知らない結末は、結末の字をそのまま並べる。
 */
const bundleText = (outcome, urls) => {
  const n = count(urls);
  if (outcome === "max_pages") return t("links.box.maxPages", { n });
  if (outcome === "max_depth") return t("links.box.maxDepth", { n });
  if (outcome === "closed") return t("links.box.closed", { n });
  return t("links.box.other", { n, text: linkOutcomeOf(outcome).text });
};

/** ページの結末の字（capture-ledger の state と理由をそのまま）。 */
const outcomeOfPage = (page) =>
  page.reason === null || page.reason === undefined ? String(page.state) : `${String(page.state)}: ${page.reason}`;

const drawLinksHosts = () => {
  const box = $("links-hosts");
  box.replaceChildren();
  const hosts = linksView.graph?.hosts ?? [];
  if (hosts.length === 0) return;
  const details = document.createElement("details");
  details.append(tag("summary", t("links.hosts.list", { n: hosts.length })));
  const list = document.createElement("ul");
  for (const one of hosts) {
    const item = document.createElement("li");
    item.append(
      ...tNodes("links.hosts.item", { hostname: one.hostname, n: one.urls, host: (text) => tag("span", text, "mono") }),
    );
    list.append(item);
  }
  details.append(list);
  box.append(details);
};

const drawLinksPanel = () => {
  const { graph, pageId, crawlId } = linksView;
  const box = $("links-panel");
  box.replaceChildren();
  box.hidden = graph === undefined;
  if (graph === undefined) return;
  const page = pageId === undefined ? undefined : graph.pages.find((one) => one.id === pageId);
  if (page === undefined) {
    box.append(tag("p", t("links.panel.hint"), "muted"));
    return;
  }
  const origin = originOf(graph);
  const h3 = document.createElement("h3");
  h3.append(tag("span", page.url, "mono"));
  if (page.title) h3.append(tag("span", page.title, "muted"));
  h3.append(tag("span", outcomeOfPage(page), `state ${pageKind(page.state)}`));
  box.append(h3);
  if (!graph.recorded) {
    box.append(tag("p", t("links.panel.notRecorded"), "muted"));
    return;
  }
  const answer = linksView.pages.get(pageId);
  if (answer === undefined) {
    box.append(tag("p", t("common.loading"), "muted"));
    return;
  }
  if (answer instanceof Error) {
    box.append(tag("p", t("links.panel.failed", { said: answer.message }), "state bad"));
    return;
  }
  const byId = new Map(graph.pages.map((one) => [one.id, one]));
  const pageLink = (id) => {
    const a = document.createElement("a");
    a.href = linksHash(crawlId, id);
    a.className = "mono";
    a.textContent = boxLabelOf(byId.get(id)?.url ?? id, origin, 60);
    return a;
  };
  const into = document.createElement("p");
  if (answer.in.length === 0) {
    into.append(page.parent === null ? t("links.panel.inNoneSeed") : t("links.panel.inNone"));
  } else {
    // リンク元のページ（8 つまで）を、区切りを挟んで 1 つの値にして文に埋める
    const from = [...new Set(answer.in.map((link) => link.from))];
    const pages = document.createDocumentFragment();
    from.slice(0, 8).forEach((id, i) => pages.append(i === 0 ? "" : t("common.sep.dot"), pageLink(id)));
    const n = answer.in.length;
    into.append(
      ...(from.length > 8
        ? tNodes("links.panel.inMore", { n, pages, more: from.length - 8 })
        : tNodes("links.panel.in", { n, pages })),
    );
  }
  box.append(into);
  if (answer.out.length === 0) box.append(tag("p", t("links.panel.outNone")));
  for (const group of groupsOf(answer.out)) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.append(
      tag("span", t("links.panel.group", { text: group.text, n: count(group.links.length) }), `state ${group.kind}`),
    );
    details.append(summary);
    const list = document.createElement("ul");
    for (const link of group.links) {
      const item = document.createElement("li");
      // 行き先のページが在れば、そのページを選ぶ link。無ければ字だけ（撮っていない URL へは飛ばさない）
      item.append(
        link.to === null || link.to === undefined ? tag("span", boxLabelOf(link.url, origin, 80), "mono") : pageLink(link.to),
      );
      if (link.text) item.append(tag("span", link.text, "muted"));
      list.append(item);
    }
    details.append(list);
    // 撮らなかった理由は開いて出す（この画面で一番訊かれる所）
    details.open = group.outcome === "max_pages" || group.outcome === "max_depth" || group.outcome === "closed";
    box.append(details);
  }
};

const loadLinksPage = async (pageId) => {
  const { crawlId, graph } = linksView;
  if (graph === undefined || !graph.recorded || linksView.pages.has(pageId)) return;
  let answer;
  try {
    answer = await api(pageLinksPath(crawlId, pageId));
  } catch (err) {
    answer = asError(err);
  }
  if (linksView.crawlId !== crawlId) return; // 別のクロールを開いた
  linksView.pages.set(pageId, answer);
  if (linksView.pageId === pageId) drawLinksPanel();
};

const drawLinks = () => {
  drawLinksHead();
  drawLinksSplit();
  $("links-tools").hidden = linksView.graph === undefined;
  $("links-cross").checked = linksView.cross === true;
  const crossed = linksView.graph?.cross?.length ?? 0;
  $("links-cross").disabled = crossed === 0;
  drawLinksGraph();
  drawLinksHosts();
  drawLinksPanel();
};

/** 走っているクロールは、この画面を開いている間だけ 5 秒ごとに引き直す（畳んだ箱と選んだページは覚えたまま）。 */
const LINKS_PACE_MS = 5_000;

const loadLinks = async (crawlId, { first }) => {
  let crawl;
  let graph;
  try {
    [crawl, graph] = await Promise.all([api(`/api/crawls/${crawlId}`), api(linksPath(crawlId))]);
  } catch (err) {
    if (linksView.crawlId === crawlId) linksAnswer(t("links.failed", { said: failedText(err) }));
    return;
  }
  if (linksView.crawlId !== crawlId) return; // 別のクロールを開いた・一覧へ戻った
  linksAnswer(undefined);
  linksView.crawl = crawl;
  linksView.graph = graph;
  if (first) linksView.collapsed = foldedAtOpen(graph);
  // 走っている間は、開いたページのリンクも増える。答えを捨てて読み直す
  if (!first) linksView.pages = new Map();
  drawLinks();
  if (linksView.pageId !== undefined) void loadLinksPage(linksView.pageId);
  if (crawl.state === "running") {
    linksView.timer = setTimeout(() => void loadLinks(crawlId, { first: false }), LINKS_PACE_MS);
  }
};

const closeLinks = () => {
  if (linksView.crawlId === undefined) return;
  clearTimeout(linksView.timer);
  linksView = { crawlId: undefined };
  $("links-detail").hidden = true;
  $("crawls-list").hidden = false;
};

const openLinks = (crawlId, pageId) => {
  $("crawls-list").hidden = true;
  $("links-detail").hidden = false;
  if (linksView.crawlId === crawlId) {
    // 同じクロールの別のページ（下の一覧の link を押した）
    if (linksView.pageId !== pageId) {
      linksView.pageId = pageId;
      drawLinksGraph();
      drawLinksPanel();
      if (pageId !== undefined) void loadLinksPage(pageId);
    }
    return;
  }
  clearTimeout(linksView.timer);
  linksView = { crawlId, crawl: undefined, graph: undefined, collapsed: new Set(), pageId, cross: false, pages: new Map(), timer: undefined };
  linksAnswer(undefined);
  drawLinks();
  void loadLinks(crawlId, { first: true });
};

$("links-cross").addEventListener("change", (event) => {
  linksView.cross = event.target.checked;
  drawLinksGraph();
});
$("links-fold").addEventListener("click", () => {
  if (linksView.graph === undefined) return;
  // 畳んだ物が在れば全部開き、無ければ深さ 1 より下を畳む
  linksView.collapsed = linksView.collapsed.size > 0 ? new Set() : new Set(foldableBelowSeeds(linksView.graph));
  drawLinksGraph();
});

// ── 経緯（#trace/<クロールの id>/<ページの id>・CAPTURE-270） ─────────────────────
/**
 * 取り込み 1 回の経緯。capture-ledger の `GET /api/crawls/:id/pages/:page/trace`（ページ・取り込みの欄・ログ）と、
 * WACZ の中の WARC のレコードの一覧（`/wacz/<archive の id>/records`）を、1 本の時間軸に並べる。**何がいつ起きたかは
 * BrowserHive が残した物で、ここは並べるだけ** —— 位置と字は `public/timeline.js`。
 *
 *   answer    経緯の答え。読んでいる間は undefined
 *   read      レコードの一覧を読んだ結果（`{ files, error? }`）。読んでいる間は undefined、WACZ が無ければ null
 *   marks     一覧から作った印（対・metadata だけの要求・写し）
 *   bodies    読んだ metadata の本文（`bodyKey` → 文字）
 *   selected  選んだ物（`{ row, index }`）
 *   sort      要求の並べ方（`start`・`longest`）。答えが trace を持つ取り込みだけ
 *   only      要求の絞り込み（`all`・`trouble`）。同じ
 *   log       下のログの箱の状態（`drawLog` と同じ形）
 */
let traceView = { crawlId: undefined };

/** status と本文の両方を受ける読み手。daemon は失敗を 400 と `{ code, message }` で返すので、status を捨てない。 */
const fetchJson = async (path) => {
  const res = await fetch(path);
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  signInAgain(res, body);
  return { status: res.status, body };
};

const traceAnswer = (text) => {
  $("trace-answer").hidden = text === undefined;
  $("trace-answer").textContent = text ?? "";
};

/** いま開いている取り込みか。遅れて届いた別の取り込みの答えは捨てる。 */
const traceIs = (crawlId, pageId) => traceView.crawlId === crawlId && traceView.pageId === pageId;

/** 印を、読んだ本文に当てた形。 */
const traceMarks = () =>
  traceView.marks === undefined ? undefined : applyMetadata(traceView.marks, traceView.bodies);

/** 答えの trace の行から作った要求（軸に置く形）。答えが trace を持たなければ undefined。 */
const traceRequests = () => {
  const { answer } = traceView;
  if (answer === undefined || !hasTrace(answer)) return undefined;
  const axis = axisOf(answer);
  return axis === undefined ? undefined : requestsOf(answer.trace, axis.endMs);
};

/** 写しの印。答えが trace を持てばログの行から、持たなければ WACZ のレコードから。 */
const traceSnapshots = () => {
  const { answer } = traceView;
  if (answer !== undefined && hasTrace(answer)) return snapshotsFromLog(answer.log?.lines ?? [], answer.capture);
  return traceMarks()?.snapshots ?? [];
};

/** 要求の種類の色。 */
const requestTone = (kind) =>
  kind === "finished" || kind === "redirected" ? "ok" : kind === "failed" ? "bad" : kind === "pending" ? "run" : "muted";

/** 要求の title。形ごとに、長さを言うか・終わりが無いと言うか・始まりだけを言うか。 */
const requestTitle = (one) => {
  const said = { kind: requestKindText(one.kind), url: String(one.line.url), from: secondsText(one.fromMs) };
  if (one.shape === "bar") return t("trace.request.title", { ...said, length: lengthText(one.toMs - one.fromMs) });
  return one.shape === "open" ? t("trace.request.titleOpen", said) : t("trace.request.titleMark", said);
};

const drawTraceHead = () => {
  const { answer, crawlId } = traceView;
  const head = $("trace-head");
  head.replaceChildren();
  const back = document.createElement("p");
  back.className = "change-back";
  const toList = document.createElement("a");
  toList.href = "#crawls";
  toList.textContent = t("trace.back");
  back.append(toList);
  head.append(back);
  const h2 = document.createElement("h2");
  h2.append(tag("span", t("trace.title")), tag("span", crawlId.slice(0, 8), "mono"));
  if (answer !== undefined) {
    h2.append(tag("span", String(answer.page.url), "wide"));
    const capture = answer.capture;
    if (capture !== null) {
      h2.append(tag("span", statusText(capture.status), `state ${capture.status === "success" ? "ok" : "bad"}`));
    }
  }
  head.append(h2);
  if (answer === undefined) return;
  if (answer.reason !== null && answer.reason !== undefined) {
    const said = tag("p", `${traceReasonText(answer.reason)} `, "muted");
    said.append(tag("span", String(answer.reason), "mono"));
    head.append(said);
    return;
  }
  const capture = answer.capture;
  const axis = axisOf(answer);
  const facts = [
    axis === undefined ? undefined : t("trace.facts.total", { took: secondsText(axis.endMs) }),
    typeof capture.httpStatusCode === "number" ? `HTTP ${String(capture.httpStatusCode)}` : undefined,
  ].filter((fact) => fact !== undefined);
  const line = tag("p", facts.join(t("common.sep.dot")), "trace-facts");
  const stopped = stoppedStepOf(answer);
  if (stopped !== undefined) {
    const mark = (text) => tag("span", text, "mono state bad");
    const why = capture.errorDetails?.message;
    line.append(
      t("common.sep.dot"),
      ...(typeof why === "string"
        ? tNodes("trace.facts.stoppedWhy", { mark, step: stopped, why })
        : tNodes("trace.facts.stopped", { mark, step: stopped })),
    );
  }
  if (answer.archive === null) {
    // 答えが trace を持つ取り込みは、WACZ が無くても要求の並びを出せる
    line.append(t("common.sep.dot"), hasTrace(answer) ? t("trace.facts.noWaczLines") : t("trace.facts.noWacz"));
  } else {
    const open = document.createElement("a");
    open.href = waczHash(answer.archive.id);
    open.textContent = t("trace.facts.openWacz");
    line.append(t("common.sep.dot"), open);
  }
  head.append(line);
};

/** 帯の行。左に名前、右に軸。 */
const traceRow = (label, children, className) => {
  const row = document.createElement("div");
  row.className = className === undefined ? "trace-row" : `trace-row ${className}`;
  const track = document.createElement("div");
  track.className = "trace-track";
  track.append(...children);
  row.append(tag("span", label, "lab"), track);
  return row;
};

/** 軸の上の 1 つ。`from`〜`to` の帯か、`at` の印。押すと下の欄に出す。 */
const traceMark = ({ row, index, fromMs, toMs, atMs, className, text, title }, endMs) => {
  const b = document.createElement("button");
  b.type = "button";
  const picked = traceView.selected?.row === row && traceView.selected.index === index;
  b.className = picked ? `${className} sel` : className;
  if (atMs !== undefined) {
    b.style.left = `${String(percentOf(atMs, endMs))}%`;
  } else {
    const left = percentOf(fromMs, endMs);
    b.style.left = `${String(left)}%`;
    b.style.width = `${String(Math.max(0, percentOf(toMs, endMs) - left))}%`;
  }
  if (text !== undefined) b.textContent = text;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", () => {
    traceView.selected = { row, index };
    drawTraceChart();
    drawTraceRequests();
    drawTracePanel();
  });
  return b;
};

/** console の行の色の種類。 */
const consoleKind = (level) => (level === "error" ? "bad" : level === "warn" ? "run" : "muted");

/** metadata だけの要求の色の種類。 */
const noteKind = (kind) => (kind === "failed" ? "bad" : kind === "incomplete" ? "run" : "muted");


/** 帯の title。名前と、始まりと長さ。 */
const barTitle = (name, one) =>
  t("trace.bar.title", { name, from: secondsText(one.fromMs), length: secondsText(one.toMs - one.fromMs) });

const drawTraceChart = () => {
  const box = $("trace-chart");
  box.replaceChildren();
  const { answer } = traceView;
  const axis = answer === undefined ? undefined : axisOf(answer);
  if (axis === undefined) return;
  const { endMs } = axis;
  const lines = answer.log?.lines ?? [];
  const chart = document.createElement("div");
  chart.className = "trace-chart";
  // 目盛り
  const ticks = ticksOf(endMs).map((ms) => {
    const label = tag("span", secondsText(ms, { unit: false }), "tick-label");
    label.style.left = `${String(percentOf(ms, endMs))}%`;
    return label;
  });
  chart.append(traceRow(t("trace.row.seconds"), ticks, "axis"));
  const steps = stepsOf(lines, endMs);
  chart.append(
    traceRow(
      t("trace.row.steps"),
      steps.map((one, index) =>
        traceMark({ row: "step", index, ...one, className: "bar step", text: one.step, title: barTitle(one.step, one) }, endMs),
      ),
    ),
  );
  const details = detailsOf(lines, endMs);
  if (details.length > 0) {
    chart.append(
      traceRow(
        t("trace.row.details"),
        details.map((one, index) =>
          traceMark({ row: "detail", index, ...one, className: "bar detail", text: one.text, title: barTitle(one.text, one) }, endMs),
        ),
      ),
    );
  }
  const settle = settleOf(answer.capture?.settle, lines);
  if (settle !== undefined) {
    const marks = [
      traceMark({ row: "settle", index: 0, fromMs: settle.fromMs, toMs: settle.toMs, className: "bar wait", text: t("trace.row.wait"), title: t("trace.wait.title", { length: secondsText(settle.toMs - settle.fromMs), endedBy: String(settle.endedBy) }) }, endMs),
    ];
    const points = [
      ["load", settle.loadMs],
      [t("trace.wait.networkQuiet"), settle.networkQuietMs],
      [t("trace.wait.domQuiet"), settle.domQuietMs],
      [t("trace.wait.cpuQuiet"), settle.cpuQuietMs],
    ];
    points.forEach(([name, ms], i) => {
      if (ms === undefined) return;
      marks.push(traceMark({ row: "settle", index: i + 1, atMs: ms, className: "tick accent", title: t("trace.wait.pointTitle", { name, at: secondsText(ms) }) }, endMs));
    });
    chart.append(traceRow(t("trace.row.wait"), marks));
  }
  const scripts = scriptsOf(lines, endMs);
  if (scripts.length > 0) {
    chart.append(
      traceRow(
        t("trace.row.scripts"),
        scripts.map((one, index) =>
          traceMark({ row: "script", index, ...one, className: one.open ? "bar script open" : "bar script", text: one.script, title: one.open ? t("trace.bar.titleOpen", { name: one.script, from: secondsText(one.fromMs) }) : barTitle(one.script, one) }, endMs),
        ),
      ),
    );
  }
  const consoles = consoleOf(lines);
  if (consoles.length > 0) {
    chart.append(
      traceRow(
        "console",
        consoles.map((one, index) =>
          traceMark({ row: "console", index, atMs: one.ms, className: `tick ${consoleKind(one.level)}`, title: t("trace.console.title", { level: one.level, at: secondsText(one.ms), msg: one.msg }) }, endMs),
        ),
      ),
    );
  }
  const lined = traceRequests();
  const marks = traceMarks();
  if (lined !== undefined) {
    // 軸の行には始まりの印だけを置く（棒は、下の要求の並びに 1 行ずつ）。終わりを知らない行は中抜き
    chart.append(
      traceRow(
        t("trace.row.requests"),
        lined.map((one) =>
          traceMark({ row: "request", index: one.index, atMs: one.fromMs, className: one.shape === "bar" ? `tick ${requestTone(one.kind)}` : `tick hollow ${requestTone(one.kind)}`, title: requestTitle(one) }, endMs),
        ),
      ),
    );
  } else if (marks !== undefined) {
    const requests = [
      ...marks.exchanges.map((one, index) =>
        traceMark({ row: "exchange", index, atMs: one.ms, className: "tick ok", title: t("trace.exchange.title", { status: String(one.status ?? ""), uri: one.uri, at: secondsText(one.ms) }) }, endMs),
      ),
      ...marks.notes.map((one, index) =>
        traceMark({ row: "note", index, atMs: one.ms, className: `tick hollow ${noteKind(one.kind)}`, title: t("trace.note.title", { kind: kindText(one.kind), uri: one.uri, at: secondsText(one.ms) }) }, endMs),
      ),
    ];
    chart.append(traceRow(t("trace.row.requests"), requests));
  }
  const snapshots = traceSnapshots();
  if (snapshots.length > 0) {
    chart.append(
      traceRow(
        t("trace.row.snapshots"),
        snapshots.map((one, index) =>
          traceMark({ row: "snapshot", index, atMs: one.ms, className: "tick content", title: t("trace.snapshot.title", { stage: one.stage, at: secondsText(one.ms) }) }, endMs),
        ),
      ),
    );
  }
  box.append(chart);
};

/**
 * 要求の並び（答えが trace を持つ取り込み）。1 行に 1 つの交信で、右の軸に始まりから終わりまでの棒を描く。
 * 終わらなかった行は軸の終わりまでの点線、長さを持たない行（残さなかった・止めた・追うのをやめた・終わりを観測
 * できない）は始まりの印だけ。並べ方と絞り込みは、この画面の中だけの物（URL には持たない）。
 */
const drawTraceLines = (box) => {
  const { answer } = traceView;
  const axis = axisOf(answer);
  if (axis === undefined) return;
  const counts = requestCountsOf(answer.trace);
  const said = [
    t("trace.tally.requests", { n: count(counts.total) }),
    counts.finished > 0 ? t("trace.tally.finished", { n: count(counts.finished) }) : undefined,
    counts.redirected > 0 ? t("trace.tally.redirected", { n: count(counts.redirected) }) : undefined,
    counts.failed > 0 ? t("trace.tally.failed", { n: count(counts.failed) }) : undefined,
    counts.pending > 0 ? t("trace.tally.pending", { n: count(counts.pending) }) : undefined,
    counts.unobservable > 0 ? t("trace.tally.unobservable", { n: count(counts.unobservable) }) : undefined,
    counts.denied > 0 ? t("trace.tally.denied", { n: count(counts.denied) }) : undefined,
    counts["not-archived"] > 0 ? t("trace.tally.notArchived", { n: count(counts["not-archived"]) }) : undefined,
    counts.evicted > 0 ? t("trace.tally.evicted", { n: count(counts.evicted) }) : undefined,
    counts.dropped > 0 ? t("trace.tally.dropped", { n: count(counts.dropped) }) : undefined,
  ].filter((one) => one !== undefined);
  box.append(tag("p", said.join(t("common.sep.dot")), "trace-tally"));
  const all = requestsOf(answer.trace, axis.endMs);
  if (all.length === 0) return;
  // 並べ方と絞り込み
  const tools = document.createElement("p");
  tools.className = "trace-tools";
  const redraw = () => {
    drawTraceRequests();
  };
  const sortLabel = document.createElement("label");
  const sort = document.createElement("select");
  for (const [value, text] of [["start", t("trace.sort.start")], ["longest", t("trace.sort.longest")]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = traceView.sort === value;
    sort.append(option);
  }
  sort.addEventListener("change", () => {
    traceView.sort = sort.value;
    redraw();
  });
  sortLabel.append(tag("span", t("trace.sort.label")), sort);
  const onlyLabel = document.createElement("label");
  const only = document.createElement("input");
  only.type = "checkbox";
  only.checked = traceView.only === "trouble";
  only.addEventListener("change", () => {
    traceView.only = only.checked ? "trouble" : "all";
    redraw();
  });
  onlyLabel.append(only, tag("span", t("trace.only.trouble")));
  tools.append(sortLabel, onlyLabel);
  box.append(tools);
  const rows = sortRequests(filterRequests(all, traceView.only), traceView.sort);
  if (rows.length === 0) {
    box.append(tag("p", t("trace.requests.none"), "muted"));
    return;
  }
  const list = document.createElement("div");
  list.className = "trace-reqs lined";
  for (const one of rows) {
    const b = document.createElement("button");
    b.type = "button";
    const picked = traceView.selected?.row === "request" && traceView.selected.index === one.index;
    b.className = picked ? "trace-req sel" : "trace-req";
    const tone = requestTone(one.kind);
    const status = one.line.response?.status;
    const state =
      typeof status === "number" && one.kind !== "pending" && one.kind !== "unobservable"
        ? tag("span", String(status), `mono state ${status >= 400 ? "bad" : tone}`)
        : tag("span", requestKindText(one.kind), `state ${tone}`);
    const track = document.createElement("span");
    track.className = "trace-track";
    const left = percentOf(one.fromMs, axis.endMs);
    const mark = tag("i", "", one.shape === "bar" ? `bar req ${tone}` : one.shape === "open" ? `bar req open ${tone}` : `tick hollow ${tone}`);
    mark.style.left = `${String(left)}%`;
    if (one.shape !== "mark") mark.style.width = `${String(Math.max(0, percentOf(one.toMs, axis.endMs) - left))}%`;
    track.append(mark);
    b.title = requestTitle(one);
    b.append(
      tag("span", secondsText(one.fromMs, { unit: false }), "num mono"),
      state,
      tag("span", one.shape === "bar" ? lengthText(one.toMs - one.fromMs) : "—", "num mono"),
      tag("span", String(one.line.url), "mono url"),
      track,
    );
    b.addEventListener("click", () => {
      traceView.selected = { row: "request", index: one.index };
      drawTraceChart();
      drawTraceRequests();
      drawTracePanel();
    });
    list.append(b);
  }
  box.append(list);
};

/** 要求の並び。始まり（か記録した時刻）の順に 1 行ずつ。押すと下の欄に出す。 */
const drawTraceRequests = () => {
  const box = $("trace-requests");
  box.replaceChildren();
  const { answer, read } = traceView;
  if (answer === undefined) return;
  if (hasTrace(answer)) {
    drawTraceLines(box);
    return;
  }
  if (answer.archive === null || answer.archive === undefined) return;
  const axis = axisOf(answer);
  if (axis === undefined) return;
  if (read === undefined) {
    box.append(tag("p", t("trace.requests.loading"), "muted"));
    return;
  }
  const marks = traceMarks();
  const tally = traceTallyOf(marks);
  const said = [
    t("trace.tally.exchanges", { n: count(tally.exchanges) }),
    tally.incomplete > 0 ? t("trace.tally.incomplete", { n: count(tally.incomplete) }) : undefined,
    tally.failed > 0 ? t("trace.tally.failed", { n: count(tally.failed) }) : undefined,
    tally.denied > 0 ? t("trace.tally.denied", { n: count(tally.denied) }) : undefined,
    tally["not-archived"] > 0 ? t("trace.tally.notArchived", { n: count(tally["not-archived"]) }) : undefined,
    tally.unread > 0 ? t("trace.tally.unread", { n: count(tally.unread) }) : undefined,
  ].filter((one) => one !== undefined);
  const title = tag("p", said.join(t("common.sep.dot")), "trace-tally");
  box.append(title);
  if (read.error !== undefined) {
    const why =
      read.error.status === 404
        ? t("trace.requests.forbidden")
        : t("trace.requests.unreadable", { said: read.error.message });
    box.append(tag("p", why, "state warn"));
  }
  const rows = [
    ...marks.exchanges.map((one, index) => ({ row: "exchange", index, one })),
    ...marks.notes.map((one, index) => ({ row: "note", index, one })),
  ].sort((a, b) => (a.one.ms ?? 0) - (b.one.ms ?? 0));
  if (rows.length === 0) return;
  const list = document.createElement("div");
  list.className = "trace-reqs";
  for (const { row, index, one } of rows) {
    const b = document.createElement("button");
    b.type = "button";
    const picked = traceView.selected?.row === row && traceView.selected.index === index;
    b.className = picked ? "trace-req sel" : "trace-req";
    const state =
      row === "exchange"
        ? tag("span", String(one.status ?? "—"), `mono state ${typeof one.status === "number" && one.status >= 400 ? "bad" : "ok"}`)
        : tag("span", kindText(one.kind), `state ${noteKind(one.kind)}`);
    const track = document.createElement("span");
    track.className = "trace-track";
    const mark = tag("i", "", row === "exchange" ? "tick ok" : `tick hollow ${noteKind(one.kind)}`);
    mark.style.left = `${String(percentOf(one.ms, axis.endMs))}%`;
    track.append(mark);
    b.append(tag("span", secondsText(one.ms, { unit: false }), "num mono"), state, tag("span", String(one.uri), "mono url"), track);
    b.addEventListener("click", () => {
      traceView.selected = { row, index };
      drawTraceChart();
      drawTraceRequests();
      drawTracePanel();
      if (row === "note" && one.kind === "unread") void readTraceBodies([one]);
    });
    list.append(b);
  }
  box.append(list);
};

/** 選んだ物の欄。名前と値を 1 行ずつ。 */
const drawTracePanel = () => {
  const box = $("trace-panel");
  box.replaceChildren();
  const { answer, selected } = traceView;
  if (answer === undefined || selected === undefined) return;
  const axis = axisOf(answer);
  if (axis === undefined) return;
  const lines = answer.log?.lines ?? [];
  const panel = document.createElement("dl");
  panel.className = "trace-panel";
  const put = (name, value, className) => {
    if (value === undefined || value === null || value === "") return;
    const dd = value instanceof Node ? document.createElement("dd") : tag("dd", String(value), className);
    if (value instanceof Node) dd.append(value);
    panel.append(tag("dt", name), dd);
  };
  const marks = traceMarks();
  const { row, index } = selected;
  if (row === "step") {
    const one = stepsOf(lines, axis.endMs)[index];
    if (one === undefined) return;
    put(t("trace.panel.step"), one.step, "mono");
    put(t("trace.panel.start"), secondsText(one.fromMs));
    put(t("trace.panel.length"), secondsText(one.toMs - one.fromMs));
  } else if (row === "detail") {
    const one = detailsOf(lines, axis.endMs)[index];
    if (one === undefined) return;
    put(t("trace.panel.detail"), one.text, "mono");
    put(t("trace.panel.step"), one.step, "mono");
    put(t("trace.panel.start"), secondsText(one.fromMs));
    put(t("trace.panel.length"), secondsText(one.toMs - one.fromMs));
  } else if (row === "settle") {
    const settle = settleOf(answer.capture?.settle, lines);
    if (settle === undefined) return;
    const quietAt = (ms) => (ms === undefined ? t("trace.wait.neverQuiet") : secondsText(ms));
    put(t("trace.panel.wait"), t("trace.panel.waitSpan", { from: secondsText(settle.fromMs), length: secondsText(settle.toMs - settle.fromMs) }));
    put(t("trace.panel.endedBy"), settle.endedBy, "mono");
    put("load", settle.loadMs === undefined ? undefined : secondsText(settle.loadMs));
    put(t("trace.wait.networkQuiet"), quietAt(settle.networkQuietMs));
    put(t("trace.wait.domQuiet"), quietAt(settle.domQuietMs));
    put(t("trace.wait.cpuQuiet"), quietAt(settle.cpuQuietMs));
  } else if (row === "script") {
    const one = scriptsOf(lines, axis.endMs)[index];
    if (one === undefined) return;
    put(t("trace.panel.script"), one.script, "mono");
    put(t("trace.panel.start"), secondsText(one.fromMs));
    put(t("trace.panel.length"), one.open ? t("trace.panel.scriptOpen") : secondsText(one.toMs - one.fromMs));
  } else if (row === "console") {
    const one = consoleOf(lines)[index];
    if (one === undefined) return;
    put("console", one.source === "page" ? t("trace.console.fromPage", { level: one.level }) : t("trace.console.fromScript", { level: one.level }));
    put(t("trace.panel.time"), secondsText(one.ms));
    put(t("trace.panel.message"), one.msg);
  } else if (row === "request") {
    const one = traceRequests()?.[index];
    if (one === undefined) return;
    const { line } = one;
    put(t("trace.panel.request"), line.urlCut === true ? t("trace.panel.urlCut", { url: String(line.url) }) : line.url, "mono url");
    put("method", line.method, "mono");
    put(t("trace.panel.resourceType"), line.resourceType, "mono");
    put(t("trace.panel.outcome"), requestKindText(one.kind));
    put(t("trace.panel.error"), line.error, "mono");
    put(t("trace.panel.start"), t("trace.panel.startOnAxis", { at: secondsText(one.fromMs) }));
    put(t("trace.panel.startedAt"), t("trace.panel.startedAtNote", { at: String(line.startedAt) }));
    if (one.shape === "bar") {
      put(t("trace.panel.length"), lengthText(one.toMs - one.fromMs));
    } else {
      const why =
        one.kind === "pending"
          ? t("trace.noLength.pending")
          : one.kind === "unobservable"
            ? t("trace.noLength.unobservable")
            : one.kind === "evicted"
              ? t("trace.noLength.evicted")
              : one.kind === "failed"
                ? t("trace.noLength.failed")
                : t("trace.noLength.policy");
      put(t("trace.panel.length"), t("trace.panel.noLength", { why }));
    }
    const timing = timingOf(line);
    if (timing !== undefined) {
      const names = {
        dnsMs: t("trace.timing.dnsMs"),
        connectMs: t("trace.timing.connectMs"),
        tlsMs: t("trace.timing.tlsMs"),
        sendMs: t("trace.timing.sendMs"),
        waitMs: t("trace.timing.waitMs"),
        receiveMs: t("trace.timing.receiveMs"),
      };
      // 内訳は ms で書く（1 つずつは短く、秒では 0.00 が並ぶ）
      const ms = (n) => lengthText(n);
      const parts = timing.parts
        .filter((part) => part.ms > 0)
        .map((part) => t("trace.timing.part", { name: names[part.key], length: ms(part.ms) }));
      if (timing.otherMs > 0) parts.push(t("trace.timing.part", { name: t("trace.timing.otherMs"), length: ms(timing.otherMs) }));
      put(t("trace.panel.breakdown"), parts.join(t("common.sep.dot")));
    }
    const initiator = line.initiator;
    if (initiator !== undefined && initiator !== null) {
      const said = { type: String(initiator.type), url: String(initiator.url), line: String(initiator.line) };
      put(
        t("trace.panel.initiator"),
        typeof initiator.url !== "string"
          ? initiator.type
          : typeof initiator.line === "number"
            ? t("trace.initiator.atLine", said)
            : t("trace.initiator.atUrl", said),
        "mono url",
      );
    }
    put("status", line.response?.status, "mono");
    put("protocol", line.response?.protocol, "mono");
    put(t("trace.panel.cache"), line.response?.fromCache === true ? t("trace.panel.fromCache") : undefined);
    put(t("trace.panel.bytes"), typeof line.encodedBytes === "number" ? count(line.encodedBytes) : undefined);
    put(t("trace.panel.hop"), typeof line.hop === "number" && (line.hop > 0 || one.kind === "redirected") ? String(line.hop) : undefined, "mono");
    put(t("trace.panel.recordId"), line.record, "mono");
  } else if (row === "exchange" && marks !== undefined) {
    const one = marks.exchanges[index];
    if (one === undefined) return;
    put(t("trace.panel.request"), one.uri, "mono url");
    put(t("trace.panel.start"), t("trace.panel.startByChromium", { at: secondsText(one.ms) }));
    put("status", one.status, "mono");
    put(t("trace.panel.mime"), one.mime, "mono");
    put(t("trace.panel.body"), one.bodyOmitted === undefined ? undefined : t("trace.panel.bodyOmitted", { why: one.bodyOmitted }));
  } else if (row === "note" && marks !== undefined) {
    const one = marks.notes[index];
    if (one === undefined) return;
    put(t("trace.panel.request"), one.uri, "mono url");
    put(t("trace.panel.record"), kindText(one.kind));
    put(t("trace.panel.recordedAt"), t("trace.panel.recordedAtNote", { at: secondsText(one.ms) }));
    put(t("trace.panel.reason"), one.reason, "mono");
    put(t("trace.panel.error"), one.error, "mono");
    put(t("trace.panel.pattern"), one.pattern, "mono");
    put(t("trace.panel.resourceType"), one.resourceType, "mono");
    put("method", one.method, "mono");
  } else if (row === "snapshot") {
    const one = traceSnapshots()[index];
    if (one === undefined) return;
    put(t("trace.panel.snapshot"), one.stage, "mono");
    put(t("trace.panel.time"), secondsText(one.ms));
    put(t("trace.panel.document"), one.documentUrl, "mono url");
    const objectKey = answer.archive?.objectKey;
    // 文書の URL の無い写し（方針で伏せた文書）は、開く先を組めない
    if (typeof objectKey === "string" && typeof one.uri === "string") {
      const opens = document.createElement("span");
      for (const viewer of VIEWERS) {
        const hit = { stage: one.stage, objectKey, capturedAt: answer.page.capturedAt, url: one.uri };
        opens.append(link(hitReplaywebHref(settings[viewer.setting], hit), viewerText(viewer)), " ");
      }
      put(t("trace.panel.open"), opens);
    }
  }
  if (panel.childElementCount > 0) box.append(panel);
};

const drawTraceNotes = () => {
  const box = $("trace-notes");
  box.replaceChildren();
  const { answer } = traceView;
  if (answer === undefined || answer.capture === null || answer.capture === undefined) return;
  // 時計と「記録した時刻」の注記は、WACZ のレコードから読んだ取り込みだけの話。trace の行は、軸も終わりも持っている
  const notes = hasTrace(answer)
    ? [t("trace.notes.traceAxis"), t("trace.notes.traceUnobservable"), t("trace.notes.traceUnsigned")]
    : [t("trace.notes.clocks"), t("trace.notes.recordedAt"), t("trace.notes.unobservable"), t("trace.notes.unsigned")];
  const list = document.createElement("ul");
  list.className = "trace-notes";
  for (const note of notes) list.append(tag("li", note));
  box.append(list);
};

const drawTraceLog = () => {
  const box = $("trace-log");
  box.replaceChildren();
  const { answer } = traceView;
  if (answer === undefined || answer.capture === null || answer.capture === undefined) return;
  box.append(tag("h3", t("trace.log.title")));
  if (answer.log === null || answer.log === undefined) {
    box.append(tag("p", t("trace.log.none"), "muted"));
    return;
  }
  // ページの表のログの箱と同じ描き方（絞り込みと、流した位置を覚える）
  traceView.log ??= { answer: { page: answer.page, log: answer.log, reason: null }, filter: "all", scrollTop: 0, box: undefined };
  box.append(logBoxOf(traceView.log));
};

const drawTrace = () => {
  drawTraceHead();
  drawTraceChart();
  drawTraceRequests();
  drawTracePanel();
  drawTraceNotes();
  drawTraceLog();
};

/** metadata の本文を読む（`record` を 1 本ずつ）。読めた分だけ印に当てる。 */
const readTraceBodies = async (wanted) => {
  const { crawlId, pageId, answer } = traceView;
  const archiveId = answer?.archive?.id;
  if (typeof archiveId !== "string") return;
  await Promise.all(
    wanted.map(async (at) => {
      if (traceView.bodies.has(bodyKey(at))) return;
      try {
        const { status, body } = await fetchJson(recordPath(archiveId, at.path, at.offset, at.length));
        if (status === 200 && body.body?.kind === "text" && traceIs(crawlId, pageId)) {
          traceView.bodies.set(bodyKey(at), String(body.body.content));
        }
      } catch {
        // 読めなかった記録は「読んでいない」のまま残す
      }
    }),
  );
  if (!traceIs(crawlId, pageId)) return;
  drawTraceChart();
  drawTraceRequests();
  drawTracePanel();
};

const loadTrace = async (crawlId, pageId) => {
  let answer;
  try {
    answer = await api(tracePath(crawlId, pageId));
  } catch (err) {
    if (traceIs(crawlId, pageId)) traceAnswer(t("trace.unreadable", { said: failedText(err) }));
    return;
  }
  if (!traceIs(crawlId, pageId)) return; // 別の取り込みを開いた・一覧へ戻った
  traceAnswer(undefined);
  traceView.answer = answer;
  // WACZ の無い取り込み（時間切れ・失敗）と、答えの無いページでは、レコードを読みに行かない
  if (!readsRecords(answer)) {
    traceView.read = null;
    drawTrace();
    return;
  }
  const axis = axisOf(answer);
  drawTrace();
  let read;
  try {
    read = await readRecords(fetchJson, answer.archive.id);
  } catch (err) {
    read = { files: [], error: { status: 0, message: failedText(err) } };
  }
  if (!traceIs(crawlId, pageId)) return;
  traceView.read = read;
  traceView.marks = traceMarksOf(read.files, axis.originMs);
  drawTrace();
  // metadata の本文は、先に NOTES_EAGER 本まで。残りは、要求の並びで押したときに読む
  const attached = traceView.marks.exchanges.filter((one) => one.attached !== undefined).map((one) => one.attached);
  await readTraceBodies([...traceView.marks.notes, ...attached].slice(0, NOTES_EAGER));
};

const closeTrace = () => {
  if (traceView.crawlId === undefined) return;
  traceView = { crawlId: undefined };
  $("trace-detail").hidden = true;
  $("crawls-list").hidden = false;
};

const openTrace = (crawlId, pageId) => {
  $("crawls-list").hidden = true;
  $("trace-detail").hidden = false;
  if (traceIs(crawlId, pageId)) return;
  traceView = { crawlId, pageId, answer: undefined, read: undefined, marks: undefined, bodies: new Map(), selected: undefined, sort: "start", only: "all", log: undefined };
  traceAnswer(undefined);
  drawTrace();
  void loadTrace(crawlId, pageId);
};

// ── 画面の切り替え ───────────────────────────────────────────────────
const FACES = ["crawls", "start", "schedules", "changes", "archives", "search", "scripts", "wacz"];

const show = (face) => {
  for (const b of document.querySelectorAll("#tabs button")) {
    b.classList.toggle("on", b.dataset.face === face);
  }
  for (const name of FACES) $(`face-${name}`).hidden = name !== face;
  document.body.dataset.face = face; // 新しいクロールの画面だけ、CSS が窓の高さに収める
};

/**
 * URL が画面を決める。`#wacz/…` は WACZ の画面、`#scripts` と `#scripts/…` はスクリプト集の画面（読む所）、
 * `#search` と `#search/<語>` は検索の画面、`#links/…` と `#trace/…` はクロールの画面の中（リンクの構成・経緯）、
 * `#changes/…` は変化の画面、それ以外はほかの画面のどれか。
 */
const route = () => {
  // リンクの構成（#links/…）と経緯（#trace/…）は、同じ一覧を隠す。**先に両方を閉じ、後から開く** —— 片方から
  // もう片方へ移ったときに、閉じる側が一覧を出し直さないように（開く側は下の枝で、閉じた後に一覧を隠す）
  if (parseLinksHash(location.hash) === undefined) closeLinks();
  if (parseTraceHash(location.hash) === undefined) closeTrace();
  const target = parseWaczHash(location.hash);
  if (target !== undefined) {
    void openWacz(target);
    return;
  }
  const words = parseSearchHash(location.hash);
  if (words !== undefined) {
    show("search");
    searching.hash = location.hash;
    if (words !== searching.words) void runSearch(words);
    return;
  }
  const links = parseLinksHash(location.hash);
  if (links !== undefined) {
    show("crawls");
    openLinks(links.crawlId, links.pageId);
    return;
  }
  const trace = parseTraceHash(location.hash);
  if (trace !== undefined) {
    show("crawls");
    openTrace(trace.crawlId, trace.pageId);
    return;
  }
  const changes = parseChangesHash(location.hash);
  if (changes !== undefined) {
    show("changes");
    void openChanges(changes.crawlId, changes.pageId);
    return;
  }
  const asked = parseReading(location.hash);
  if (asked !== undefined || location.hash === "#scripts") {
    show("scripts");
    void openReading(asked);
    return;
  }
  const face = location.hash.slice(1);
  show(FACES.includes(face) && face !== "wacz" && face !== "scripts" && face !== "search" ? face : "crawls");
};

// WACZ の画面・スクリプト集の画面・検索の画面は、最後に読んだ所へ戻る
for (const b of document.querySelectorAll("#tabs button")) {
  b.onclick = () => {
    const face = b.dataset.face;
    location.hash =
      face === "wacz"
        ? (wacz.hash ?? "archives")
        : face === "scripts"
          ? (reading.hash ?? "scripts")
          : face === "search"
            ? (searching.hash ?? "search")
            : face;
  };
}
window.addEventListener("hashchange", route);

// ── 読み込みの間隔 ─────────────────────────────────────────────────
/**
 * **走っている間だけ速く引く。** 1 往復 1 クエリなので、写しを持たなくても live に
 * 見える。走っていなければ 30 秒 —— 動いていないときは黙る。
 */
// 終わった行が最後の合本の版を待つ間も速く引く。30 秒に落とすと、その間ずっと古い版を開く link が残る
const pace = () => (crawls.some((c) => c.state === "running" || awaitsFinalBundle(c)) ? 2_000 : 30_000);

/** 次の引きの予約。**1 つだけ** —— 始めた直後に引き直しても、引く輪が 2 本にならない。 */
let timer;

const refresh = async () => {
  try {
    const [c, a, s] = await Promise.all([
      api("/api/crawls"),
      api("/api/archives"),
      api("/api/scripts"),
    ]);
    crawls = c.crawls;
    archives = a.archives;
    drawCrawls();
    refreshOpened();
    forgetMissing(checks, archives.map((x) => x.id));
    drawArchives();
    reading.latest = s.scripts;
    drawReadingList();
    drawPicks(s.scripts);
    trouble(undefined);
    $("pulse").textContent = t("common.pulse.status", {
      crawls: crawls.length,
      archives: archives.length,
      time: timeOfDay(new Date()),
      seconds: pace() / 1000,
    });
  } catch (err) {
    trouble(failedText(err));
    $("pulse").textContent = t("common.pulse.failed");
  }
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), pace());
};

const start = async () => {
  try {
    settings = await (await fetch("/healthz")).json();
    const who = settings.signedIn;
    $("who").textContent =
      who === null || who === undefined
        ? t("common.who.signedOut")
        : t("common.who.signedIn", { user: who.user, groups: who.groups.join(", ") || t("common.who.noGroups") });
  } catch {
    $("who").textContent = t("common.who.unreachable");
  }
  drawRules();
  syncStart(); // 上限を知ってから、欄の下の行を出す
  void refreshSchedules(); // 別の輪。クロールの表を待たせない
  await refresh();
  route();
};

void start();
