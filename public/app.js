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
import { checkVerdict, count, forgetMissing, judgedUnder, linksOf, secretArchiveOf, severityKind, stateOf, statsOf, took, verdict } from "/format.js";
import {
  ACTIONS,
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
  CRON_PRESETS,
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
import { diagnosisOf, diffOf, failedOnTypes, fixAnswer, hasErrorsIn, lacksValues, noteText } from "/fix.js";
import {
  awaitsFinalBundle,
  isPartialBundle,
  PARTIAL_BUNDLE_NOTE,
  replayBundleFailure,
  replayBundleHref,
  replayBundleText,
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
  if (!res.ok) throw new Error(body.error ?? body.message ?? `${path} → ${String(res.status)}`);
  return body;
};

const post = async (path) => {
  const res = await fetch(path, { method: "POST" });
  const body = await res.json();
  signInAgain(res, body);
  if (!res.ok) throw new Error(body.error ?? body.message ?? `${path} → ${String(res.status)}`);
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
    a.title = PARTIAL_BUNDLE_NOTE;
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
    ? `取れなかったページはありません（起点: ${one.seeds.join(", ")}）`
    : failures.map((f) => `${f.url} — ${f.reason ?? "理由なし"}`).join("\n");
};

/** 対象サイトの印（サイト用のスクリプトのホスト名）。一覧・見出し・新しいクロールの画面・クロールの詳しい所で同じ形。 */
const siteChip = (sites, suffix = " 用") => tag("span", `${sites.join("・")}${suffix}`, "site");

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
    asking ? "訊いています…" : state === undefined ? "直し方を訊く" : "もう 1 度訊く",
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
      button("直した版を欄に戻す", () => intoForm(name, script.phase, state.body.source)),
      tag("span", "確かめたのは型だけです。動きは差分を読み、撮って確かめてください", "muted"),
    );
    box.append(notes, diffBoxOf(state.body.edits), back);
  } else if (Array.isArray(state.body.refusals) && state.body.refusals.length > 0) {
    box.append(tag("p", `断った案: ${state.body.refusals.join(" ／ ")}`, "muted"));
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
  if (scripts.length === 0) return tag("p", "走らせたもの: なし");
  const list = document.createElement("ol");
  list.className = "ran";
  for (const script of scripts) {
    const item = document.createElement("li");
    const where =
      script.inline === undefined
        ? `登録 v${String(script.version)}・${script.phase}`
        : `その場・${script.phase}・${count(script.inline.bytes)} バイト`;
    item.append(tag("span", script.id, "mono"));
    if (script.sites.length > 0) item.append(siteChip(script.sites));
    item.append(tag("span", where, "muted"));
    // その場の TS は、直して撮り直せるように欄へ戻せる（登録済みのスクリプトは capture-ledger に在る）。source は詳しい所に
    // 無いので、押したときに名前で引くエンドポイントから取る
    if (script.inline !== undefined) {
      item.append(button("欄に戻す", () => void putBack(one.crawlId, script.inline.name)));
      // 型の誤りの在るその場の TS には、直し方を訊く道も（押したときだけ Claude を呼ぶ）
      if (hasErrorsIn(one.diagnosed, script.id)) item.append(...fixOf(one.crawlId, script));
    } else {
      // 走った版を読む。番号は使い回されうるので sha256 の頭も渡し、読む所が食い違いを言う
      const read = tag("a", "読む");
      read.href = readingHash({ id: script.id, version: script.version, sha: script.sha256.slice(0, 12) });
      item.append(read);
    }
    list.append(item);
  }
  const box = document.createElement("div");
  box.append(tag("p", "走らせたもの（並びが実行順）"), list);
  return box;
};

/** 時刻を読める形に。読めない文字列（capture-ledger が null を返した所など）はそのまま。 */
const whenOf = (iso) => {
  const ms = Date.parse(String(iso));
  return Number.isNaN(ms) ? String(iso) : new Date(ms).toLocaleString("ja-JP");
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
      : tag("p", "User-Agent: HeadlessChrome のまま", "muted"),
  );
  const vars = Object.entries(one.variables ?? {});
  const secrets = one.secrets ?? [];
  if (vars.length === 0 && secrets.length === 0) {
    box.append(tag("p", "渡した値: なし", "muted"));
    return box;
  }
  if (vars.length > 0) {
    box.append(tag("p", "渡した値（変数。名前と値）"));
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
    box.append(tag("p", "使ったシークレット（名前と Windmill の変数。値は capture-ledger・写し・ページの文字・ログに無い）"));
    const list = document.createElement("ul");
    list.className = "secrets";
    for (const secret of secrets) {
      const item = document.createElement("li");
      item.append(tag("span", String(secret.name), "mono"), tag("span", String(secret.path), "mono muted"));
      item.append(tag("span", `edited_at ${whenOf(secret.editedAt)}`, "muted"));
      if (secret.rotated !== null && secret.rotated !== undefined) {
        item.append(
          tag("span", `段 ${String(secret.rotated.depth)} から替わった（${whenOf(secret.rotated.editedAt)}）`, "state warn"),
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

/** 動きの画面の言い方（新しいクロールの画面の選ぶ欄と同じ）。 */
const ACTION_LABEL = Object.fromEntries(ACTIONS);

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
    box.append(tag("p", `規則の判断を読めません: ${decided.message}`, "muted"));
    return box;
  }
  if (decided.decisions.length === 0) {
    box.append(tag("p", "規則で決めたリンクはありません", "muted"));
  } else {
    box.append(tag("p", "規則ごと（段を跨いで足した、別々の URL の数）"));
    const list = document.createElement("ol");
    list.className = "tally";
    for (const t of ruleTallies(decided.rules, decided.decisions)) {
      const item = document.createElement("li");
      item.append(
        tag("span", t.rule === 0 ? "どれにも当たらない（落とす）" : `${String(t.rule)}. ${ACTION_LABEL[t.action] ?? t.action}`),
        tag("span", t.pattern, "mono"),
        tag("span", `${count(t.links)} 本`, "num mono"),
      );
      if (t.rule !== 0 && t.links === 0) item.append(tag("span", "当たっていません", "state warn"));
      list.append(item);
    }
    box.append(list);
  }
  const drops = dropsOf(decided.decisions, decided.robots);
  if (drops.length > 0) {
    box.append(tag("p", "落とした物（規則と robots.txt・ホスト名ごと）"));
    const table = document.createElement("table");
    table.className = "drops";
    for (const d of drops) {
      const row = document.createElement("tr");
      row.append(
        cell(d.why === "robots" ? "robots.txt" : d.why === 0 ? "どれにも当たらない" : `規則 ${String(d.why)}`),
        cell(d.hostname, "mono"),
        cell(`${count(d.links)} 本`, "num mono"),
        cell(d.sample, "mono muted"),
      );
      table.append(row);
    }
    box.append(table);
  }
  const line = document.createElement("p");
  const inspect = tag("a", "f/waggle/inspect_crawl", "mono");
  inspect.href = inspectHref(settings.windmillOrigin, settings.windmillWorkspace, one.crawlId);
  inspect.target = "_blank";
  inspect.rel = "noopener";
  line.append("Windmill で調べる: ", inspect, `（crawl = ${one.crawlId.slice(0, 8)}）`);
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
    box.replaceChildren(tag("p", "読み込み中…", "muted"));
    return;
  }
  if (answer instanceof Error) {
    box.replaceChildren(tag("p", `ログを読めません: ${answer.message}`, "state bad"));
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
    const chip = button(`${label} ${count(linesAt(lines, id).length)}`, () => {
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
    a.textContent = "WACZ の画面で開く";
    a.title = `WACZ の ${sealed.path}（WACZ Profile 1.19.0 より前の WACZ には無い）`;
    bar.append(a);
  }
  const shown = linesAt(lines, state.filter);
  if (shown.length === 0) {
    box.replaceChildren(bar, tag("p", lines.length === 0 ? "行はありません" : "この絞り込みに当たる行はありません", "muted"));
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
    if (line.truncated === true) msg.append(tag("span", "途中で切った", "cut"));
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
 * 結末の後ろの「replay ↗」は、そのページをクロールの合本の中で開く。合本は詳しい所（`/api/crawls/:id`。ページと
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
    box.append(tag("p", `ページを読めません: ${list.message}`, "muted"));
    return box;
  }
  if (list.pages.length === 0) {
    box.append(tag("p", "ページ: なし", "muted"));
    return box;
  }
  box.append(tag("p", "ページ（capture-ledger に入った順。warn と error はログの行の数で、— は数を読んでいない）"));
  const table = document.createElement("table");
  table.className = "pagelist";
  const head = document.createElement("tr");
  head.append(tag("th", "URL"), tag("th", "結末"), tag("th", "warn", "num"), tag("th", "error", "num"), tag("th", "ログ"));
  table.append(head);
  for (const { page, log } of rowsOf(views, one.crawlId, list)) {
    const row = document.createElement("tr");
    const url = document.createElement("td");
    url.append(tag("span", String(page.url), "mono url"));
    const outcome = document.createElement("td");
    const said = tag("span", outcomeOf(page, one.state), "outcome");
    const replay = replayBundleHref(settings.replaywebServerOrigin, one.replayBundle, page);
    if (replay !== undefined) said.append(" ", bundleLink(replay, "replay ↗", one));
    outcome.append(said);
    const toggle = document.createElement("td");
    toggle.append(button(log === undefined ? "ログ ▾" : "閉じる ▴", () => toggleOne(one.crawlId, page.id)));
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
      next.textContent = "読み込み中…";
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
  if (said.kind === "trouble") return [tag("p", `型の誤りを取り直せません: ${said.text}`, "state bad")];
  if (said.kind === "clean") {
    return [tag("p", `取り直すと、いまの組み合わせは型を通ります（TypeScript ${said.typescript}）`, "muted")];
  }
  const table = document.createElement("table");
  table.className = "typeerrors";
  const head = document.createElement("tr");
  head.append(tag("th", "スクリプト"), tag("th", "行:列"), tag("th", "code"), tag("th", "文"));
  table.append(head);
  for (const row of said.rows) {
    const tr = document.createElement("tr");
    tr.append(cell(row.where, "mono"), cell(row.at, "mono"), cell(row.code, "mono"), cell(row.message));
    table.append(tr);
  }
  const box = document.createElement("div");
  box.append(
    tag("p", `型の誤り（組み合わせを ts-compile-service に送り直した。TypeScript ${said.typescript}・${String(said.rows.length)} 件）`),
    table,
    ...(lacksValues(said) ? [tag("p", "必須の変数が渡されていません。値を渡して始め直してください", "state warn")] : []),
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
 * 次が合本を書けなかった理由。合本はクロールを止めない派生物なので warn の色で、「replay ↗」が無い（前の版を開く）
 * 訳をここで言う。capture-ledger の文は言い換えない。
 */
const detailOf = (one) => {
  const bundleFailure = replayBundleFailure(one.replayBundle);
  return [
    ...(one.error === null || one.error === undefined
      ? []
      : [tag("p", `失敗の文: ${one.error}`, "state bad pre")]),
    ...(bundleFailure === undefined ? [] : [tag("p", bundleFailure, "state warn pre")]),
    ...typeErrorsOf(one),
    ranOf(one),
    valuesOf(one),
    decisionsOf(one),
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
  if (one === undefined) td.textContent = "読み込み中…";
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
    row.append(cell(state.text, `state ${state.kind}`));
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
    row.append(cell(linksOf(crawl), "num mono"));
    row.append(cell(String(crawl.waczCount), "num mono"));
    row.append(cell(took(crawl), "num mono"));
    // 行き先: run と、capture-ledger が合本を書けていれば、クロールを 1 つのアーカイブとして replayweb-server で。**run ↗ が先頭**
    // （docs の画面の絵の印が、この欄の先頭の link を指す）
    const go = linkCell(runHref(crawl), "run ↗");
    const replay = replayBundleHref(settings.replaywebServerOrigin, crawl.replayBundle);
    if (replay !== undefined) go.append(bundleLink(replay, replayBundleText(crawl), crawl));
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
 */
const runRow = (id, title, body) => {
  const no = tag("span", "", "pick-no");
  const moves = tag("span", "", "pick-moves");
  const arrow = (text, delta, what) => {
    const b = button(text, () => {
      moved = movedOrder(runOf(), id, delta);
      syncStart();
      (b.disabled ? moves.querySelector("button:enabled") : b)?.focus();
    });
    b.setAttribute("aria-label", `${title} を${what}`);
    moves.append(b);
    return b;
  };
  const up = arrow("↑", -1, "上へ移す");
  const down = arrow("↓", 1, "下へ移す");
  const el = tag("div", "", "pick-row");
  el.append(no, body, moves);
  return { id, el, no, moves, up, down };
};

/** その場の TS の行。読み込みの後に走る物を書いたときだけ出す（`drawRunOrder`）。チェックは無い —— 書いてあれば走る。 */
const inlineRow = runRow(INLINE_ROW, "その場の TS", tag("span", "その場の TS", "pick"));

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
    const read = tag("a", "読む", "read");
    read.href = readingHash({ id: script.id, version: script.version });
    read.dataset.read = "";
    const why = script.sites.length === 0 ? undefined : tag("span", "", "why");
    // 既定に入らないスクリプト。チェックは外れた状態で出るが、付ければ走る（capture-ledger は名指しを通す）
    const off = script.enabled ? [] : [tag("span", "既定では走らない", "off")];
    // 名前と対象サイトをまとめる。狭い列で対象サイトや「読む」が折り返しても、名前の下に揃う（理由の行と同じ）
    const head = tag("span", "", "phead");
    head.append(name, ...(script.sites.length === 0 ? [] : [siteChip(script.sites)]), ...off, read);
    label.append(input, head, ...(why === undefined ? [] : [why]));
    picks.push({ script, input, why, ...runRow(script.id, script.id, label) });
  }
  if (scripts.length === 0) box.append(tag("span", "登録済みのスクリプトがありません（スクリプト集の画面を見てください）", "muted"));
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
        ? "起点を書くと選べます"
        : `起点に ${script.sites.join("・")} がありません`;
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
    id === INLINE_ROW ? inlineRow : picks.find((pick) => pick.id === id),
  );
  for (const { id, no, moves, up, down } of rows) {
    const at = live.indexOf(id);
    no.textContent = at === -1 ? "" : String(at + 1);
    moves.hidden = at === -1;
    up.disabled = at === 0;
    down.disabled = at === live.length - 1;
  }
  inlineRow.el.hidden = !live.includes(INLINE_ROW);
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
    if (v.required) input.placeholder = "必須";
    return input;
  }
  const select = document.createElement("select");
  select.append(
    new Option(v.required ? "必須" : "渡さない", ""),
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
    if (v.required) head.append(tag("span", "必須", "req"));
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
  line.append("使うシークレット: ");
  secrets.forEach((s, i) => {
    if (i > 0) line.append("、");
    line.append(tag("span", s.name, "mono"));
    if (s.required) line.append(tag("span", "必須", "req"));
    const archive = archiveTag(s.archive);
    if (archive !== undefined) line.append(" ", archive);
  });
  line.append(
    tag("span", "。値はここには書きません。Windmill の変数 f/waggle_secrets/<名前> に人が置き、capture-ledger が在るかを確かめます", "muted"),
  );
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
    trouble(`欄に戻せません: ${failedText(err)}`);
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
  line.textContent = size.over
    ? `本文が上限（${count(limit)} バイト）を ${count(size.bytes - limit)} バイト超えています。始められません`
    : `${count(size.lines)} 行 · 本文 ${count(size.bytes)} バイト` +
      (limit === Infinity ? "" : ` · 上限の ${String(size.percent)}%`);
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
    said.textContent = "規則がありません。型から埋めるか、行を足してください。";
    said.className = "start-said bad";
    return;
  }
  if (answer === undefined) {
    const asked = rulesCheck.key === checkQuery($("start-seeds").value, ruleRows);
    said.textContent = asked ? "capture-ledger に確かめられません（始めれば、capture-ledger が答えで言います）" : "capture-ledger に確かめています…";
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
    action.setAttribute("aria-label", `${n} 行目の動き`);
    for (const [value, label] of ACTIONS) {
      const option = tag("option", label);
      option.value = value;
      option.selected = value === rule.action;
      action.append(option);
    }
    const pattern = document.createElement("input");
    pattern.type = "text";
    pattern.spellcheck = false;
    pattern.dataset.field = "pattern";
    pattern.value = rule.pattern;
    pattern.placeholder = "same-site・ads.example.com・https://…/search";
    pattern.setAttribute("aria-label", `${n} 行目の当てる物`);
    const actionCell = document.createElement("td");
    actionCell.append(action);
    const patternCell = document.createElement("td");
    patternCell.append(pattern);
    const tools = document.createElement("td");
    tools.className = "tools";
    for (const [label, op, what] of [
      ["↑", "-1", "上へ移す"],
      ["↓", "1", "下へ移す"],
      ["×", "0", "消す"],
    ]) {
      const b = button(label);
      b.dataset.op = op;
      b.setAttribute("aria-label", `${n} 行目を${what}`);
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

/**
 * 欄から 1 本始める。**送る前に検査しない** —— 読めない URL は capture-ledger が 400 で言う。
 * 答えは欄の下に 1 行で、capture-ledger の文は言い換えずに出す（`start.js` の `startAnswer`）。
 */
const startCrawl = async (event) => {
  event.preventDefault();
  const body = startBodyNow();
  if (body.seeds.length === 0) return;
  $("start-go").disabled = true;
  let status = 0;
  let answer = {};
  try {
    const res = await fetch("/api/crawls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    status = res.status;
    answer = await res.json().catch(() => ({}));
  } catch (err) {
    answer = { error: failedText(err) };
  }
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
  ...CRON_PRESETS.map((preset) =>
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
    tag("span", `合格 ${String(s.passed)}`, "big"),
    tag("span", v.text, `big state ${v.kind}`),
    tag(
      "span",
      [...judgedUnder(report), `${String(s.durationMs)} ms`, ...statsOf(report)].join(" ／ "),
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
      a.textContent = "仕様 ↗";
      a.className = "mono";
      line.append(a);
    }
    td.append(line);
  }

  for (const entry of report.entries) {
    const line = document.createElement("div");
    line.className = "line";
    line.append(
      tag("span", entry.present ? "entry" : "無い", entry.present ? "muted" : "state warn"),
      tag("span", entry.path, "mono"),
      tag(
        "span",
        entry.present ? `${String(entry.uncompressedSize ?? 0)} B` : "（上の指摘の実体）",
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
  if (asking || answer === undefined) td.textContent = "検証しています…";
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
    answer = await post(`/wacz/${enc(id)}/validate`);
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
    row.append(cell(new Date(archive.capturedAt).toLocaleString("ja-JP"), "mono"));
    // **null は「分からない」。** 「不完全」と同じに描かない。
    row.append(
      cell(archive.waczComplete === null ? "—" : archive.waczComplete ? "完全" : "欠けあり"),
    );
    const check = document.createElement("td");
    check.append(button("検証", () => void toggleCheck(archive.id)));
    row.append(verdictCellOf(archive.id));
    row.append(check);
    row.append(hashCell(waczHash(archive.id), "開く"));
    row.append(
      linkCell(replaywebHref(settings.replaywebServerOrigin, archive), "replay ↗"),
    );
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
    what.append(tag("div", hit.title === "" ? "（題なし）" : hit.title));
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
      what.append(tag("div", `文字は伏せています（${hit.textWithheld}）`, "hit-note"));
    }
    if (hit.textTruncated === true) what.append(tag("div", "文字は上限で切っています（全文ではありません）", "hit-note"));
    what.append(
      tag("div", `撮れたもの: ${hit.sourceUrl}（${new Date(hit.capturedAt).toLocaleString("ja-JP")}）`, "hit-note"),
    );
    row.append(what);
    // 行き先: WACZ の画面（一覧に在るアーカイブだけ）と replayweb-server
    const go = document.createElement("td");
    go.className = "hit-go";
    if (known.has(hit.archiveId)) {
      const open = document.createElement("a");
      open.href = waczHash(hit.archiveId);
      open.textContent = "開く";
      go.append(open);
    }
    go.append(link(hitReplaywebHref(settings.replaywebServerOrigin, hit), "replay ↗"));
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
  answer.textContent = `「${words}」を探しています…`;
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
      ? `「${words}」は見つかりません（見せてよいアーカイブの中に）。`
      : `「${words}」: ${String(total)} 件。1 件はアーカイブの 1 時点です（写しのある取り込みは写しの時点ごと）。`;
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
  if (!res.ok) throw new Error(body.error ?? body.message ?? `${path} → ${String(res.status)}`);
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
    nav.replaceChildren(tag("span", "既定で走る", "grp"));
    if (anywhere.length === 0) {
      nav.append(tag("span", reading.latest.length === 0 ? "（登録済みのスクリプトが無い）" : "（無し）", "muted"));
    }
    nav.append(...anywhere.map(item));
    if (onSites.length > 0) {
      nav.append(tag("span", "サイト用（起点がそのサイトのとき）", "grp"), ...onSites.map(item));
    }
    if (off.length > 0) {
      nav.append(tag("span", "既定では走らない（選べば走る）", "grp"), ...off.map(item));
    }
    nav.append(tag("span", "書くための型", "grp"));
    if (types === null) nav.append(tag("span", "host.d.ts（capture-ledger に無い）", "muted"));
    if (types !== null && types !== undefined) {
      nav.append(listItem(TYPES_HASH, "host.d.ts", `v${String(types.version)}`, TYPES_KEY));
    }
  }
  markListed();
};

/** 本文の上の 1 行。太字の文と、続く文。undefined なら隠す。 */
const readingNote = (at, bold, rest = "", kind = "warn") => {
  const p = at.note;
  p.hidden = bold === undefined;
  if (bold === undefined) return;
  p.className = `reading-note ${kind}`;
  p.replaceChildren(tag("b", bold), document.createTextNode(rest));
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
      painter.broken = new Error(event.message || "色付けの worker を起動できない");
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
      note.textContent = `色を付けられません（${failedText(err)}）`;
      note.hidden = false;
    });

/** 写す。http://127.0.0.1 は安全な文脈なので clipboard が使える。断られたら上の帯で言う。 */
const copyButton = (source) => {
  const b = button("写す", async () => {
    try {
      await navigator.clipboard.writeText(source);
      b.textContent = "写しました";
      setTimeout(() => {
        b.textContent = "写す";
      }, 1500);
    } catch (err) {
      trouble(`写せません: ${failedText(err)}`);
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
    const mark = v.version === defaultVersion ? "（既定）" : v.enabled ? "" : "（無効）";
    a.textContent = `v${String(v.version)}${mark}`;
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
    readingNote(IN_CATALOG, 
      "受け皿の型はまだ capture-ledger に在りません。",
      "cd ../capture-ledger && pnpm run scripts import .upstream/capture-scripts で入ります。",
      "bad",
    );
    drawLines(IN_CATALOG, undefined);
    return;
  }
  drawReadingHead(IN_CATALOG, {
    name: `host.d.ts v${String(types.version)}`,
    facts: metaOf(types),
    actions: [copyButton(types.source)],
    aside:
      "受け皿 __bh の型（capture-scripts の types/host.d.ts の写し）。クロールの変換が使う型は " +
      "ts-compile-service の pin で、クロールの compiledWith.hostTypes に出ます",
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
    readingNote(IN_CATALOG, `${target.id} は登録されていません。`, "", "bad");
    drawLines(IN_CATALOG, undefined);
    return;
  }
  const defaultVersion = defaultVersionOf(reading.latest, target.id);
  const version = target.version ?? reading.latest.find((s) => s.id === target.id)?.version ?? listed.versions[0].version;
  const chips = chipsOf(target.id, listed.versions, version, defaultVersion);
  const entry = listed.versions.find((v) => v.version === version);
  if (entry === undefined) {
    drawReadingHead(IN_CATALOG, { name: `${target.id} v${String(version)}`, chips, facts: [] });
    readingNote(IN_CATALOG, 
      `v${String(version)} は登録されていません（消されています）。`,
      "走った物はアーカイブの behaviors/custom.jsonl に在ります（変換後の JS）。",
    );
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
    actions: [copyButton(doc.source), button("下敷きにする", () => putTemplate(doc))],
    aside: "走った JS（アーカイブの custom.jsonl）とは行が合いません",
  });
  // URL の sha256 の頭（クロールの「読む」が付ける）が、開いた版と食い違えば言う。本文は出す
  if (target.sha !== undefined && !doc.sha256.startsWith(target.sha)) {
    readingNote(IN_CATALOG, 
      `このクロールが走らせた v${String(version)} とは中身が違います。`,
      `クロールの記録は sha256 ${target.sha}…、登録済みの v${String(version)} は ` +
        `${doc.sha256.slice(0, 12)}… です。v${String(version)} は一度消され、別の中身で登録し直されて` +
        "います。走った物はアーカイブの behaviors/custom.jsonl に在ります（変換後の JS）。",
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
      drawReadingHead(IN_CATALOG, { name: "スクリプト集", facts: [] });
      readingNote(IN_CATALOG, undefined);
      drawLines(IN_CATALOG, undefined);
      return;
    }
    if (target.id === undefined) openTypes(target, stale);
    else await openScript(target, stale);
  } catch (err) {
    if (!stale()) readingNote(IN_CATALOG, "読めません: ", failedText(err), "bad");
  }
};

/** 欄に書きかけがあるとき、置き換えるかを本文の上で訊く（at の所の中で）。 */
const askReplace = (at, doc, lines) => {
  const box = at.ask;
  box.hidden = false;
  box.replaceChildren(
    tag("span", `新しいクロールの欄に書きかけの TS（${count(lines)} 行）があります。`),
    button("置き換える", () => {
      box.hidden = true;
      putTemplate(doc, { replace: true, at });
    }),
    button("やめる", () => {
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
  said.textContent =
    `下敷き: ${doc.id} v${String(doc.version)} を写しました。` +
    (changed.length === 0
      ? "id を替える所はありませんでした。"
      : `${changed.join("・")} 行目の id を inline-${name} に替えました。`) +
    `登録済みの ${doc.id} は外しました（両方走ると 2 回走ります）。` +
    // その場の TS は対象サイトを持たない。スクリプトの冒頭の見分けが、ほかのサイトでは何もさせない
    (doc.sites.length === 0
      ? ""
      : `対象サイト（${doc.sites.join("・")}）は写しに付きません。その場の TS は、どの起点でも走ります。`);
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
  const full = tag("a", "スクリプト集の画面で開く");
  full.href = readingHash(target);
  if (target.id === undefined) {
    drawReadingHead(IN_START, { facts: metaOf(doc), actions: [copyButton(doc.source), full] });
    return;
  }
  const defaultVersion = defaultVersionOf(reading.latest, doc.id);
  drawReadingHead(IN_START, {
    facts: [...metaOf(doc), optionsText(doc.options)],
    standing: standingOf(doc, defaultVersion),
    actions: [copyButton(doc.source), button("下敷きにする", () => putTemplate(doc, { at: IN_START })), full],
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
      readingNote(
        IN_START,
        "受け皿の型はまだ capture-ledger に在りません。",
        "cd ../capture-ledger && pnpm run scripts import .upstream/capture-scripts で入ります。",
        "bad",
      );
      return;
    }
    startRead.doc = doc;
    drawStartReadHead();
    drawLines(IN_START, doc.source);
    void colorize(IN_START, doc, stale); // 1 色で読めるようにしてから、worker の答えを同じ行に塗る
  } catch (err) {
    if (!stale()) readingNote(IN_START, "読めません: ", failedText(err), "bad");
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
    tag("span", new Date(archive.capturedAt).toLocaleString("ja-JP"), "mono muted"),
  );
  if (status !== undefined) {
    bar.append(tag("span", status, "muted"));
    return;
  }
  const s = wacz.report.summary;
  const v = verdict(s);
  bar.append(
    tag("span", `合格 ${String(s.passed)}`, "mono state ok"),
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
  head.append(tag("span", issues.length === 0 ? "指摘なし" : `指摘 ${String(issues.length)}`, issues.length === 0 ? "muted" : "state warn"));
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
    trouble(`archive ${archiveId} は見えません`);
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
    drawWaczBar("検証しています…");
    try {
      wacz.report = await post(`/wacz/${enc(archiveId)}/validate`);
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
      drawHead(entry, ["レコードの一覧"]);
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
    if (page.gunzipped) $("wacz-head").append(tag("span", "gzip 展開", "muted"));
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
    const more = button(`続きを読む（${String(page.next + 1)} 行目から ${String(WINDOW)} 行）`, () => {
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
  const note = line.cut ? " · 4 MiB で切った" : line.binary ? " · binary" : "";
  panel.append(tag("div", `${String(n + 1)} 行目 · ${formatBytes(line.bytes)}${note}`, "vtag"));
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
        button(`このレコードを開く（${opener.path} の ${String(opener.offset)} から ${formatBytes(opener.length)}）`, () => {
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
  chips.append(chip(`すべて ${String(rows.length)}${next === null ? "" : `+`} / ${String(total)}`, undefined));
  for (const [type, count] of counts) chips.append(chip(`${typeName(type)} ${String(count)}`, type));
  chips.append(tag("span", "▪ 索引が指す · ▫ 索引に無い", "muted mono"));
  content.append(chips);

  const table = document.createElement("table");
  table.className = "vrecords";
  const head = document.createElement("tr");
  for (const text of ["", "種別", "状態", "content-type", "URI"]) head.append(tag("th", text));
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
      button(`続きを読む（${String(next + 1)} 件目から ${String(WINDOW)} 件・全 ${String(total)} 件）`, () => {
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
  panel.append(tag("div", `レコード · ${path} の ${String(offset)} から ${formatBytes(length)}`, "vtag"));
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
 * 最後に読めた予定。**一覧の引き直しと別の輪で読む** —— `refresh` の `Promise.all` は 1 つ落ちると描画を全部飛ばすので、
 * ここが落ちてクロールの表まで止まらないように。読めなければ帯で言う（読めないことを正常と取り違えない）。
 */
let schedules = [];
let schedulesError;
let schedulesTimer;
/** `api()` と違って時間を切る。答えない capture-ledger を待ち続けると、帯も出ない。 */
const SCHEDULES_TIMEOUT_MS = 15_000;

const drawBand = () => {
  const said = bandOf(schedules, schedulesError);
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
  box.append(button("いま撮る", () => void scheduleAction("run", path("run"))));
  box.append(
    schedule.enabled
      ? button("止める", () => void scheduleAction("pause", path("pause")))
      : button("再開", () => void scheduleAction("resume", path("resume"))),
  );
  box.append(button("固定し直す", () => void scheduleAction("repin", path("repin"))));
  box.append(
    button("消す", () =>
      void scheduleAction("delete", path("delete"), {
        ask: `予定「${schedule.name}」を消します。撮った回の行は残ります。`,
      }),
    ),
  );
  const crawlId = closableCrawl(schedule);
  if (crawlId !== undefined) {
    box.append(
      button(`走ったままの行 ${crawlId.slice(0, 8)} を締める`, () =>
        void scheduleAction("close", `/api/crawls/${crawlId}/failed`, {
          ask: `クロール ${crawlId.slice(0, 8)} を失敗として締めます。本当に走っている場合、Windmill の run は止まらず、撮り続けて次の段も投げます。止めるなら先に Windmill で run を取り消してください。`,
          body: { reason: "定期実行の画面から締めた" },
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
  row.append(cell(run.error ?? "", "wide"));
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
        `${cronWords(schedule.cron)}（${schedule.timezone}） ・ 次の回 ${shortTime(schedule.nextRunAt, schedule.timezone)} ・ ` +
          `起点 ${String(schedule.seeds.length)} ・ 深さ ${String(schedule.maxDepth)} ・ ${scriptsText(schedule)}`,
        "schedule-meta",
      ),
    );
    card.append(scheduleButtons(schedule));
    if (schedule.recentRuns.length > 0) {
      const table = document.createElement("table");
      const titles = document.createElement("tr");
      for (const title of ["結果", "本来の時刻", "始まった", "遅れ", "欠け", "理由", "id"]) {
        titles.append(tag("th", title));
      }
      const thead = document.createElement("thead");
      thead.append(titles);
      const tbody = document.createElement("tbody");
      for (const run of schedule.recentRuns) tbody.append(scheduleRunRow(run, schedule.timezone));
      table.append(thead, tbody);
      card.append(table);
    } else {
      card.append(tag("p", "まだ回がありません。", "empty"));
    }
    box.append(card);
  }
};

const refreshSchedules = async () => {
  clearTimeout(schedulesTimer);
  try {
    const res = await fetch(SCHEDULES_PATH, { signal: AbortSignal.timeout(SCHEDULES_TIMEOUT_MS) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? body.message ?? `${SCHEDULES_PATH} → ${String(res.status)}`);
    schedules = body.schedules;
    schedulesError = undefined;
  } catch (err) {
    schedulesError = failedText(err);
  }
  drawSchedules();
  drawBand();
  schedulesTimer = setTimeout(() => void refreshSchedules(), pollMs(schedules));
};

// ── 画面の切り替え ───────────────────────────────────────────────────
const FACES = ["crawls", "start", "schedules", "archives", "search", "scripts", "wacz"];

const show = (face) => {
  for (const b of document.querySelectorAll("#tabs button")) {
    b.classList.toggle("on", b.dataset.face === face);
  }
  for (const name of FACES) $(`face-${name}`).hidden = name !== face;
  document.body.dataset.face = face; // 新しいクロールの画面だけ、CSS が窓の高さに収める
};

/**
 * URL が画面を決める。`#wacz/…` は WACZ の画面、`#scripts` と `#scripts/…` はスクリプト集の画面（読む所）、
 * `#search` と `#search/<語>` は検索の画面、それ以外はほかの画面のどれか。
 */
const route = () => {
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
    $("pulse").textContent =
      `クロール ${String(crawls.length)} 本 ／ アーカイブ ${String(archives.length)} 本 ` +
      `（${new Date().toLocaleTimeString("ja-JP")} 現在、${String(pace() / 1000)} 秒ごと）`;
  } catch (err) {
    trouble(failedText(err));
    $("pulse").textContent = "取りに行けませんでした（上の表は最後に描けたもの）";
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
        ? "サインインしていません"
        : `${who.user} (${who.groups.join(", ") || "組織なし"}) としてサインインしています`;
  } catch {
    $("who").textContent = "workbench 自身に届きません";
  }
  drawRules();
  syncStart(); // 上限を知ってから、欄の下の行を出す
  void refreshSchedules(); // 別の輪。クロールの表を待たせない
  await refresh();
  route();
};

void start();
