/**
 * WACZ の画面の純関数。木の罫線は wacz-validator の tui（`render/tree.ts`）と同じ入力・同じ期待。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bodyLabel,
  buildTree,
  entryMarker,
  expectedLabel,
  flattenTree,
  formatBytes,
  isWarc,
  kindCounts,
  lineLabel,
  parseWaczHash,
  recordCells,
  recordKind,
  recordOpener,
  rowsOfKind,
  typeName,
  waczHash,
  warcinfoNote,
  warcinfoOf,
  warcinfoTag,
} from "../public/wacz-view.js";
import { setLang, t } from "../public/i18n.js";

/** 英語の字を確かめる間だけ言語を替える（`test/i18n.test.mjs` と同じ形）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

const entry = (path, over = {}) => ({ path, present: true, expectedBy: [], issues: [], ...over });

test("flat な path を §5.1 の木に組み、罫線を付ける（wacz-validator の tui と同じ期待）", () => {
  const rows = flattenTree(
    buildTree([entry("archive/data.warc.gz"), entry("datapackage.json"), entry("pages/pages.jsonl")]),
  );
  assert.deepEqual(
    rows.map((r) => r.connector + r.name),
    ["├── archive", "│   └── data.warc.gz", "├── datapackage.json", "└── pages", "    └── pages.jsonl"],
  );
});

test("中間のディレクトリは entry を持たず、葉だけが持つ", () => {
  const rows = flattenTree(buildTree([entry("archive/data.warc.gz")]));
  assert.equal(rows.find((r) => r.name === "archive")?.isDir, true);
  assert.equal(rows.find((r) => r.name === "archive")?.entry, undefined);
  assert.equal(rows.find((r) => r.name === "data.warc.gz")?.entry?.path, "archive/data.warc.gz");
});

test("印: 無い entry は理由つき、指摘は最悪の severity で", () => {
  assert.deepEqual(entryMarker(entry("x", { present: false, expectedBy: ["wacz-spec", "datapackage"] })), {
    glyph: "(無い — WACZ 1.1.1 §5.2 が要求)",
    tone: "error",
  });
  // 理由の無い「無い」は、語を重ねない（英語の (missing) と同じ形）
  assert.equal(entryMarker(entry("x", { present: false, expectedBy: [] })).glyph, "(無い)");
  assert.equal(entryMarker(entry("x", { issues: [{ severity: "warning" }, { severity: "error" }] })).glyph, "✗");
  assert.equal(entryMarker(entry("x", { issues: [{ severity: "info" }] })).glyph, "");
  assert.equal(entryMarker(undefined).glyph, "");
});

test("大きさは 1024 で刻む", () => {
  assert.equal(formatBytes(938), "938 B");
  assert.equal(formatBytes(404697), "395.2 KiB");
  assert.equal(formatBytes(6338608), "6.0 MiB");
});

test("なぜ要るかは、両方なら両方言う", () => {
  assert.equal(expectedLabel([], undefined), "—");
  assert.equal(expectedLabel(["datapackage"], undefined), "datapackage が宣言");
  assert.equal(expectedLabel(["datapackage", "wacz-spec"], "5.2.1"), "datapackage が宣言、WACZ 1.1.1 §5.2.1 が要求");
});

test("行の言い方: 切れた行は印と本来の大きさ、binary は大きさだけ", () => {
  assert.equal(lineLabel({ text: "abc", cut: false, binary: false, bytes: 3 }), "abc");
  assert.equal(
    lineLabel({ text: "head", cut: true, binary: false, bytes: 404696 }),
    "head …（395.2 KiB。一覧は 2 KiB まで）",
  );
  assert.equal(lineLabel({ text: "", cut: false, binary: true, bytes: 9930 }), "(binary · 9.7 KiB)");
});

test("レコードの列: 種別は日本語、無いものは空", () => {
  assert.deepEqual(
    recordCells({ type: "response", status: 200, mime: "image/jpeg", uri: "https://x/a.jpg", indexed: true }),
    { type: "応答", status: "200", mime: "image/jpeg", uri: "https://x/a.jpg", indexed: true },
  );
  assert.deepEqual(
    recordCells({ type: "metadata", contentType: "application/warc-fields", uri: "https://x/", indexed: false }),
    { type: "記録", status: "", mime: "application/warc-fields", uri: "https://x/", indexed: false },
  );
  assert.equal(recordCells({ type: "revisit", indexed: false }).type, "revisit");
});

/**
 * BrowserHive v31.0.0 からの名前の WARC（`archive/data-000.browserhive.warc.gz`）の、resource の 2 つ。daemon の
 * レコードの一覧の行の形（URI は BrowserHive WARC Profile 1.4.0 の #snapshots・#screenshots の形）。
 */
const NEW_WARC_RESOURCES = {
  path: "archive/data-000.browserhive.warc.gz",
  snapshot: {
    type: "resource",
    contentType: "text/html; charset=utf-8",
    uri: "urn:browserhive:snapshot:after-load:https://shop.test/result",
    indexed: true,
    offset: 18342,
    length: 2210,
  },
  screenshot: {
    type: "resource",
    contentType: "image/webp",
    uri: "urn:browserhive:screenshot:after-load:https://shop.test/result",
    indexed: true,
    offset: 20552,
    length: 40118,
  },
};

test("BrowserHive WARC の DOM の写し（resource）は「写し」と呼ぶ", () => {
  assert.equal(recordCells(NEW_WARC_RESOURCES.snapshot).type, "写し");
  assert.equal(recordKind(NEW_WARC_RESOURCES.snapshot), "resource:snapshot");
});

test("BrowserHive WARC の節目のスクリーンショット（resource）は「節目の絵」と呼び、写しと別に絞る", () => {
  assert.equal(recordCells(NEW_WARC_RESOURCES.screenshot).type, "節目の絵");
  assert.equal(recordKind(NEW_WARC_RESOURCES.screenshot), "resource:screenshot");
  assert.equal(inEnglish(() => recordCells(NEW_WARC_RESOURCES.screenshot).type), "screenshot");
});

test("URI の頭が BrowserHive の物でない resource は、WARC-Type の名前のまま", () => {
  const other = { type: "resource", contentType: "text/html", uri: "https://x/result", indexed: true };
  assert.equal(recordKind(other), "resource");
  assert.equal(recordCells(other).type, "resource");
  assert.equal(recordCells({ type: "resource", indexed: false }).type, "resource");
  assert.equal(recordKind({ type: "response", uri: "urn:browserhive:snapshot:after-load:https://x/" }), "response");
});

/**
 * WACZ の画面の種別の絞り（CAPTURE-385）。dev で撮った /warc/rollover の 2 本目の WARC と同じ並び（warcinfo・応答と要求の 3 組・
 * 写しと記録・節目の絵と記録）に、頭で分けられない resource を 1 つ足した窓。
 */
const MIXED_WINDOW = [
  { type: "warcinfo", contentType: "application/warc-fields", indexed: false },
  ...[1, 2, 3].flatMap((n) => [
    { type: "response", uri: `https://shop.test/noise?seed=${String(n)}`, status: 200, indexed: true },
    { type: "request", uri: `https://shop.test/noise?seed=${String(n)}`, indexed: false },
  ]),
  NEW_WARC_RESOURCES.snapshot,
  { type: "metadata", uri: NEW_WARC_RESOURCES.snapshot.uri, indexed: false },
  NEW_WARC_RESOURCES.screenshot,
  { type: "metadata", uri: NEW_WARC_RESOURCES.screenshot.uri, indexed: false },
  { type: "resource", contentType: "text/plain", uri: "https://shop.test/other", indexed: true },
];

test("種別の絞りのボタンの数: 写しと節目の絵を別に数え、並びは窓に初めて出た順", () => {
  assert.deepEqual(
    [...kindCounts(MIXED_WINDOW)],
    [
      ["warcinfo", 1],
      ["response", 3],
      ["request", 3],
      ["resource:snapshot", 1],
      ["metadata", 2],
      ["resource:screenshot", 1],
      ["resource", 1],
    ],
  );
  assert.equal(kindCounts([]).size, 0);
});

test("種別で絞る: 節目の絵だけ・写しだけ・頭で分けられない resource だけ、undefined は全部", () => {
  assert.deepEqual(rowsOfKind(MIXED_WINDOW, "resource:screenshot"), [NEW_WARC_RESOURCES.screenshot]);
  assert.deepEqual(rowsOfKind(MIXED_WINDOW, "resource:snapshot"), [NEW_WARC_RESOURCES.snapshot]);
  assert.deepEqual(
    rowsOfKind(MIXED_WINDOW, "resource").map((row) => row.uri),
    ["https://shop.test/other"],
  );
  assert.equal(rowsOfKind(MIXED_WINDOW, "metadata").length, 2);
  assert.equal(rowsOfKind(MIXED_WINDOW, undefined), MIXED_WINDOW);
  assert.deepEqual(rowsOfKind(MIXED_WINDOW, "revisit"), []);
});

/** wacz-validator v0.39.0 の報告の warcinfo の 1 件（daemon が ja の label を付けた形）。 */
const warcinfo = (entry, index, over = {}) => ({
  entry,
  index,
  offset: 0,
  date: "2026-11-01T09:30:00.000Z",
  contentType: "application/warc-fields",
  fields: [
    { name: "format", value: "WARC File Format 1.1", vocabulary: "dcterms", ref: "http://purl.org/dc/terms/format", label: "Dublin Core の語" },
    { name: "robots-policy", value: "ignore", vocabulary: null },
  ],
  ...over,
});

test("warcinfo: 報告から、選んだ本の記録だけを本の中の順で取る", () => {
  const report = {
    warcinfo: [
      warcinfo("archive/data-000.warc.gz", 1),
      warcinfo("archive/data-001.warc.gz", 1),
      warcinfo("archive/data-000.warc.gz", 7),
    ],
  };
  assert.deepEqual(
    warcinfoOf(report, "archive/data-000.warc.gz").map((r) => r.index),
    [1, 7],
  );
  assert.deepEqual(warcinfoOf(report, "archive/other.warc.gz"), []);
});

test("warcinfo: 報告に warcinfo が無ければ空（本に無いときと、v0.39.0 より前の daemon）", () => {
  assert.deepEqual(warcinfoOf({ entries: [], issues: [] }, "archive/data.warc.gz"), []);
});

test("warcinfo の枠の見出しは、何件目の記録かと、書かれた時刻", () => {
  assert.equal(warcinfoTag(warcinfo("archive/data.warc.gz", 1)), "warcinfo · 1 件目のレコード · 2026-11-01T09:30:00.000Z");
  assert.equal(warcinfoTag(warcinfo("archive/data.warc.gz", 3, { date: undefined })), "warcinfo · 3 件目のレコード");
});

test("warcinfo: 本文を欄に分けなかった記録だけ、そう言う", () => {
  assert.equal(warcinfoNote(warcinfo("archive/data.warc.gz", 1)), undefined);
  assert.equal(
    warcinfoNote(warcinfo("archive/data.warc.gz", 1, { contentType: "text/plain", fields: undefined })),
    "本文は欄に分けていません（Content-Type: text/plain）。分けるのは application/warc-fields の、大きすぎない本文だけです",
  );
  assert.match(warcinfoNote(warcinfo("archive/data.warc.gz", 1, { contentType: undefined, fields: undefined })), /Content-Type: 無し/);
});

test("本文の言い方", () => {
  assert.equal(bodyLabel({ kind: "image", mime: "image/png", byteLength: 2048 }), "image/png · 2.0 KiB");
  assert.equal(bodyLabel({ kind: "binary", byteLength: 10 }), "(binary · 10 B)");
  assert.equal(bodyLabel({ kind: "text", content: "x", truncated: true }), "…（64 KiB で切った）");
});

test("索引の行の fields から、開くレコードの位置を取る", () => {
  const fields = [
    { label: "key", value: "k", fromJson: false },
    { label: "offset", value: "2176252", fromJson: true },
    { label: "length", value: "10791", fromJson: true },
    { label: "filename", value: "data.warc.gz", fromJson: true },
  ];
  assert.deepEqual(recordOpener(fields), { path: "archive/data.warc.gz", offset: 2176252, length: 10791 });
  assert.equal(recordOpener(fields.filter((f) => f.label !== "filename")), undefined);
  assert.equal(recordOpener([{ label: "line", value: "plain", fromJson: false }]), undefined);
});

test("画面の URL は行まで指せて、読み戻せる", () => {
  const hash = waczHash("3a34dd38-1f05", "indexes/index.cdxj", 66);
  assert.equal(hash, "#wacz/3a34dd38-1f05/indexes%2Findex.cdxj:66");
  assert.deepEqual(parseWaczHash(hash), { archiveId: "3a34dd38-1f05", path: "indexes/index.cdxj", n: 66 });
  assert.deepEqual(parseWaczHash("#wacz/abc"), { archiveId: "abc", path: undefined, n: undefined });
  assert.equal(parseWaczHash("#archives"), undefined);
  assert.equal(isWarc("archive/data.warc.gz"), true);
  assert.equal(isWarc("indexes/index.cdxj"), false);
});

test("英語: 木の印と「なぜ要るか」。単位と罫線は言語で変わらない", () => {
  const missing = (expectedBy) => entryMarker(entry("x", { present: false, expectedBy })).glyph;
  assert.deepEqual(
    inEnglish(() => [missing(["wacz-spec", "datapackage"]), missing(["datapackage"]), missing([])]),
    ["(missing — required by WACZ 1.1.1 §5.2)", "(missing — declared in datapackage)", "(missing)"],
  );
  assert.equal(
    inEnglish(() => expectedLabel(["datapackage", "wacz-spec"], "5.2.1")),
    "declared in datapackage, required by WACZ 1.1.1 §5.2.1",
  );
  assert.equal(inEnglish(() => expectedLabel([], undefined)), "—");
  assert.equal(inEnglish(() => formatBytes(404697)), "395.2 KiB");
});

test("英語: レコードの種別は WARC-Type の名前。metadata を record と言わない", () => {
  assert.deepEqual(
    inEnglish(() =>
      ["response", "request", "metadata", "resource:snapshot", "resource:screenshot", "resource", "warcinfo", "revisit"].map(
        typeName,
      ),
    ),
    ["response", "request", "metadata", "snapshot", "screenshot", "resource", "warcinfo", "revisit"],
  );
  assert.equal(inEnglish(() => recordCells({ type: "metadata", indexed: false }).type), "metadata");
  assert.equal(typeName("warcinfo"), "warcinfo");
});

test("英語: 行と本文の言い方", () => {
  assert.equal(
    inEnglish(() => lineLabel({ text: "head", cut: true, binary: false, bytes: 404696 })),
    "head … (395.2 KiB; the list shows up to 2 KiB)",
  );
  assert.equal(inEnglish(() => lineLabel({ text: "", cut: false, binary: true, bytes: 9930 })), "(binary · 9.7 KiB)");
  assert.equal(inEnglish(() => bodyLabel({ kind: "text", content: "x", truncated: true })), "… (cut at 64 KiB)");
  assert.equal(inEnglish(() => bodyLabel({ kind: "binary", mime: "application/pdf", byteLength: 10 })), "(binary · application/pdf · 10 B)");
});

test("行の字に波括弧やタグの形が在っても、そのまま出す（辞書の文として読まない）", () => {
  const text = "{\"url\": \"<b>x</b>\", \"n\": {n}}";
  assert.equal(lineLabel({ text, cut: true, binary: false, bytes: 4096 }), `${text} …（4.0 KiB。一覧は 2 KiB まで）`);
});

test("英語: warcinfo の枠の見出しと、欄に分けなかった記録の言い方", () => {
  assert.equal(
    inEnglish(() => warcinfoTag(warcinfo("archive/data.warc.gz", 1))),
    "warcinfo · record 1 · 2026-11-01T09:30:00.000Z",
  );
  assert.equal(inEnglish(() => warcinfoTag(warcinfo("archive/data.warc.gz", 3, { date: undefined }))), "warcinfo · record 3");
  assert.equal(
    inEnglish(() => warcinfoNote(warcinfo("archive/data.warc.gz", 1, { contentType: "text/plain", fields: undefined }))),
    "The body is not split into fields (Content-Type: text/plain). Only an application/warc-fields body that is not too large is split",
  );
  assert.match(
    inEnglish(() => warcinfoNote(warcinfo("archive/data.warc.gz", 1, { contentType: undefined, fields: undefined }))),
    /Content-Type: none/,
  );
});

test("英語: 画面の側の字（指摘の数・続きを読む・1 行の見出し）。単数と複数", () => {
  assert.deepEqual(
    inEnglish(() => [1, 2].map((n) => t("wacz.head.findings", { n }))),
    ["1 finding", "2 findings"],
  );
  assert.equal(inEnglish(() => t("wacz.lines.more", { from: 201, count: 200 })), "Read on (from line 201, 200 lines)");
  assert.equal(inEnglish(() => t("wacz.lines.more", { from: 2, count: 1 })), "Read on (from line 2, 1 line)");
  assert.equal(
    inEnglish(() => t("wacz.records.more", { from: 201, count: 200, total: 1234 })),
    "Read on (from record 201, 200 records, 1234 in all)",
  );
  assert.equal(inEnglish(() => t("wacz.line.tag", { n: 3, size: "1.2 KiB" })), "line 3 · 1.2 KiB");
  assert.equal(t("wacz.line.tag", { n: 3, size: "1.2 KiB" }), "3 行目 · 1.2 KiB");
  assert.equal(t("wacz.lines.more", { from: 201, count: 200 }), "続きを読む（201 行目から 200 行）");
});
