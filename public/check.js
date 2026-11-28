/**
 * 検証の画面（`/check/<archiveId>[/<profile>]`・CAPTURE-457）の純関数。**ブラウザが読むのと同じファイル**を `node --test` が読む。
 *
 * 画面は wacz-validator の報告の `rules`（v0.52.0 から。rule 1 本の結果を 1 行）を、範囲（rule の名前の `/` の前）ごとに
 * 束ねたチェックリストにする。**文は 1 つも持たない** —— rule の説明・指摘の文・出典は、daemon が解いて返した物を
 * そのまま出す。ここが持つのは、並べ方と、結果を印と鍵に写すことだけ。
 *
 * 数は rule で数える。報告の `summary` は単位が混ざる（`passed` は rule の数、`failed` は指摘の数）ので、画面では読まない。
 */
import { t } from "./i18n.js";
import { waczHref } from "./wacz-view.js";

/** 画面が選ばせる profile。並びは切り替えの button の並び。既定は先頭（daemon の既定と同じ `spec`）。 */
export const PROFILES = Object.freeze(["spec", "browserhive"]);
export const DEFAULT_PROFILE = PROFILES[0];

/** 走らせた rule の結果。並びは画面の並び（重い物が上）。 */
export const RAN = Object.freeze(["failed", "warned", "noted", "passed"]);
/** 走らせなかった rule の結果。 */
export const NOT_RUN = Object.freeze(["skipped", "excluded"]);

// ── URL ───────────────────────────────────────────────────────────
/** 画面の URL。既定の profile は書かない（`/check/<id>`）。 */
export const checkHref = (archiveId, profile = DEFAULT_PROFILE) =>
  `/check/${encodeURIComponent(archiveId)}` + (profile === DEFAULT_PROFILE ? "" : `/${profile}`);

/** `/check/<archiveId>[/<profile>]` を読む。知らない profile・合わない形は undefined。 */
export const parseCheckHref = (path) => {
  const m = /^\/check\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (m === null) return undefined;
  const profile = m[2] ?? DEFAULT_PROFILE;
  if (!PROFILES.includes(profile)) return undefined;
  try {
    return { archiveId: decodeURIComponent(m[1]), profile };
  } catch {
    return undefined;
  }
};

// ── 報告 ───────────────────────────────────────────────────────────
/** 報告が rule ごとの結果を持つか。持たないのは wacz-validator v0.52.0 より前の daemon。 */
export const hasRules = (report) => Array.isArray(report?.rules);

/** 結果ごとの rule の数。知らない結果は `other` に数える（黙って捨てない）。 */
export const tallyOf = (rules) => {
  const tally = { failed: 0, warned: 0, noted: 0, passed: 0, skipped: 0, excluded: 0, other: 0 };
  for (const r of rules) {
    if (Object.hasOwn(tally, r.outcome) && r.outcome !== "other") tally[r.outcome] += 1;
    else tally.other += 1;
  }
  return tally;
};

/**
 * 1 本の検証の結論を 1 行で（一覧の「仕様どおりか」の欄と、画面の頭）。**合格だけを見せない** —— 警告の rule が
 * 在れば緑にしない。知らない結果の rule が在るときも緑にしない（検証器が新しく言い始めたことを黙って消さない）。
 * rule ごとの結果を持たない報告は、daemon が古いと言う。
 */
export const verdict = (report) => {
  if (!hasRules(report)) return { text: t("check.verdict.stale"), kind: "bad" };
  const tally = tallyOf(report.rules);
  if (tally.failed > 0) return { text: t("check.verdict.failed", { n: tally.failed }), kind: "bad" };
  if (tally.warned > 0 || tally.other > 0) {
    return { text: t("check.verdict.warned", { n: tally.warned + tally.other }), kind: "warn" };
  }
  return { text: t("check.verdict.ok"), kind: "ok" };
};

/**
 * 覚えた検証の答えから、一覧の「仕様どおりか」の欄の結論を作る。まだ検証していなければ undefined（欄は空）。
 * 検証できなかった（Error）は「問題なし」と区別して言う。
 */
export const checkVerdict = (answer) => {
  if (answer === undefined) return undefined;
  if (answer instanceof Error) return { text: t("check.verdict.unavailable"), kind: "bad" };
  return verdict(answer);
};

/** 頭の帯の数（rule で数える）。0 の結果は出さない。走らせなかった rule は 1 つにまとめる。 */
export const checkBandOf = (rules) => {
  const tally = tallyOf(rules);
  const parts = [
    { n: tally.failed, text: t("check.band.failed", { n: tally.failed }), kind: "bad" },
    { n: tally.warned, text: t("check.band.warned", { n: tally.warned }), kind: "warn" },
    { n: tally.other, text: t("check.band.other", { n: tally.other }), kind: "warn" },
    { n: tally.noted, text: t("check.band.noted", { n: tally.noted }), kind: "muted" },
    { n: tally.passed, text: t("check.band.passed", { n: tally.passed }), kind: "ok" },
    {
      n: tally.skipped + tally.excluded,
      text: t("check.band.notRun", { n: tally.skipped + tally.excluded }),
      kind: "muted",
    },
  ];
  return [...parts.filter((p) => p.n > 0).map(({ text, kind }) => ({ text, kind })), {
    text: t("check.band.total", { n: rules.length }),
    kind: "muted",
  }];
};

/** rule の範囲（名前の `/` の前。`cdxj/warc-offsets` → `cdxj`）。 */
export const areaOf = (rule) => {
  const i = rule.indexOf("/");
  return i < 0 ? rule : rule.slice(0, i);
};

/**
 * rule を範囲ごとに束ねる。範囲の並びは、報告に最初に出た順（rule の登録の順）。束の中は、走らせた rule を
 * 重い順（`RAN`。知らない結果は `failed` と `warned` の間）に、同じ結果の中は登録の順に。走らせなかった rule は
 * 別の束（`notRun`）に、同じく範囲ごとに。
 */
export const ruleGroupsOf = (rules) => {
  const rank = (outcome) => {
    const i = RAN.indexOf(outcome);
    return i < 0 ? 0.5 : i;
  };
  const order = [];
  for (const r of rules) if (!order.includes(areaOf(r.rule))) order.push(areaOf(r.rule));
  const bundle = (pick) =>
    order
      .map((area) => ({
        area,
        rules: rules
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => areaOf(r.rule) === area && pick(r))
          .sort((a, b) => rank(a.r.outcome) - rank(b.r.outcome) || a.i - b.i)
          .map(({ r }) => r),
      }))
      .filter((g) => g.rules.length > 0);
  return {
    ran: bundle((r) => !NOT_RUN.includes(r.outcome)),
    notRun: bundle((r) => NOT_RUN.includes(r.outcome)),
  };
};

/** rule の印。知らない結果は警告の色（緑にしない）。 */
export const outcomeMark = (outcome) => {
  switch (outcome) {
    case "failed":
      return { glyph: "✕", kind: "bad" };
    case "warned":
      return { glyph: "!", kind: "warn" };
    case "noted":
      return { glyph: "i", kind: "muted" };
    case "passed":
      return { glyph: "✓", kind: "ok" };
    case "skipped":
    case "excluded":
      return { glyph: "–", kind: "muted" };
    default:
      return { glyph: "?", kind: "warn" };
  }
};

/** 最初から開いておく rule（落ちた・警告・知らない結果）。 */
export const opensFirst = (rule) => rule.outcome === "failed" || rule.outcome === "warned" || outcomeMark(rule.outcome).glyph === "?";

/** rule の指摘の数を 1 行に（`error 3 · warning 1`）。0 件の severity は出さない。指摘の無い rule は空。 */
export const countsText = (counts) =>
  [
    counts.error > 0 ? `error ${String(counts.error)}` : undefined,
    counts.warning > 0 ? `warning ${String(counts.warning)}` : undefined,
    counts.info > 0 ? `info ${String(counts.info)}` : undefined,
  ]
    .filter((x) => x !== undefined)
    .join(" · ");

/** 走らせなかった理由。`excluded` はこの profile では見ない rule、`skipped` は版の条件で見なかった rule。 */
export const notRunText = (rule, profile) =>
  rule.outcome === "skipped"
    ? t("check.notRun.skipped", { range: rule.range ?? "?" })
    : t("check.notRun.excluded", { profile });

/** この rule の指摘（報告の並びのまま）。 */
export const ruleIssuesOf = (report, rule) => report.issues.filter((i) => i.rule === rule);

/**
 * 指摘の場所。entry が分かれば WACZ の画面へのリンク（行が分かれば、その行。`location.line` は 1 始まり、WACZ の画面の
 * 行は 0 始まり）。byte の位置は字にだけ書く（WACZ の画面に、位置で開く URL は無い）。entry の無い指摘は undefined。
 */
export const issuePlaceOf = (archiveId, issue) => {
  const loc = issue.location;
  if (loc?.entry === undefined) return undefined;
  const line = Number.isInteger(loc.line) && loc.line > 0 ? loc.line : undefined;
  const text =
    loc.entry + (line === undefined ? "" : `:${String(line)}`) + (loc.offset === undefined ? "" : ` @${String(loc.offset)}`);
  return { text, href: waczHref(archiveId, loc.entry, line === undefined ? undefined : line - 1) };
};

/** 中のファイルのうち、印を付ける物（欠けた entry と、指摘のある entry）の数。 */
export const flaggedEntries = (entries) => entries.filter((e) => !e.present || e.issues.length > 0).length;
