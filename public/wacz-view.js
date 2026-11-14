/**
 * WACZ の画面の純関数。**ブラウザが読むのと同じファイル**を `node --test` が読む（写しが腐らない）。
 *
 * 木の組み方と罫線は wacz-validator の tui（`render/tree.ts`）と同じ入力・同じ
 * 出力。試験入力も向こうと同じものを置いてある。1 行を field に割るのは daemon の
 * 仕事（`readLine` の `fields`）で、ここには無い。
 *
 * 字は辞書（`i18n/*.json` の `wacz.*`）に在り、ここは鍵を選んで `t()` に渡す。単位（B・KiB・MiB）、
 * `binary`・`STORE`・`DEFLATE`、entry の名前と罫線は、どの言語でも同じ字。
 */
import { t } from "./i18n.js";

// ── 木 ─────────────────────────────────────────────────────────────
/** flat な entries を "/" で分割して木にする（path で決定的に並べる）。 */
export const buildTree = (entries) => {
  const root = { name: "", path: "", isDir: true, children: [] };
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of sorted) {
    const segs = entry.path.split("/").filter(Boolean);
    let cur = root;
    segs.forEach((seg, i) => {
      const isLast = i === segs.length - 1;
      let child = cur.children.find((c) => c.name === seg);
      if (child === undefined) {
        child = { name: seg, path: segs.slice(0, i + 1).join("/"), isDir: !isLast, children: [] };
        if (isLast) child.entry = entry;
        cur.children.push(child);
      }
      cur = child;
    });
  }
  return root;
};

/** 木を描く順（深さ優先）の行に。各行に §5.1 の罫線 prefix を付ける。 */
export const flattenTree = (root) => {
  const rows = [];
  const walk = (node, prefix) => {
    node.children.forEach((child, i) => {
      const last = i === node.children.length - 1;
      rows.push({
        connector: prefix + (last ? "└── " : "├── "),
        name: child.name,
        path: child.path,
        isDir: child.isDir,
        entry: child.entry,
      });
      if (child.isDir) walk(child, prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");
  return rows;
};

const worst = (issues) => {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return undefined;
};

/** present:false の file の印。「なぜ期待されるか」を添える。WACZ 1.1.1 §5.2 の MUST を datapackage より優先。 */
const missingGlyph = (entry) => {
  if (entry.expectedBy.includes("wacz-spec")) return t("wacz.tree.missing.spec");
  if (entry.expectedBy.includes("datapackage")) return t("wacz.tree.missing.datapackage");
  return t("wacz.tree.missing.unknown");
};

/** file の最悪 severity（と present）からマーカーを決める。dir は none。 */
export const entryMarker = (entry) => {
  if (entry === undefined) return { glyph: "", tone: "none" };
  if (!entry.present) return { glyph: missingGlyph(entry), tone: "error" };
  const tone = worst(entry.issues);
  if (tone === "error") return { glyph: "✗", tone: "error" };
  if (tone === "warning") return { glyph: "⚠", tone: "warning" };
  return { glyph: "", tone: "none" };
};

// ── 言い方 ─────────────────────────────────────────────────────────
export const formatBytes = (n) => {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GiB`;
};

/** ZIP の圧縮方式コード → 表示名（0=STORE / 8=DEFLATE / 他=?）。 */
export const codecName = (method) => (method === 0 ? "STORE" : method === 8 ? "DEFLATE" : "?");

/** expectedBy → 「なぜ要るか」。両方該当も表現する。空（= ZIP に実在するだけ）は "—"。 */
export const expectedLabel = (expectedBy, section) => {
  const parts = [];
  if (expectedBy.includes("datapackage")) parts.push(t("wacz.expected.datapackage"));
  if (expectedBy.includes("wacz-spec")) parts.push(t("wacz.expected.spec", { section: section ?? "5.2" }));
  return parts.length > 0 ? parts.join(t("common.sep.comma")) : "—";
};

/** WARC はレコードの一覧で開く。 */
export const isWarc = (path) => path.endsWith(".warc.gz") || path.endsWith(".warc");

/** 一覧の 1 行の言い方。binary は大きさだけ、cut は末尾に印。 */
export const lineLabel = (line) => {
  if (line.binary) return `(binary · ${formatBytes(line.bytes)})`;
  return line.cut ? t("wacz.lines.cut", { text: line.text, size: formatBytes(line.bytes) }) : line.text;
};

/**
 * BrowserHive WARC の resource の URI の頭（BrowserHive WARC Profile 1.5.0 の #snapshots・#frame-snapshot-records・
 * #screenshots）。枠の写しの頭は写しの頭で始まらない（`frame-snapshot:` と `snapshot:`）ので、どの順で比べても混ざらない。
 */
const SNAPSHOT_URI = "urn:browserhive:snapshot:";
const FRAME_SNAPSHOT_URI = "urn:browserhive:frame-snapshot:";
const SCREENSHOT_URI = "urn:browserhive:screenshot:";

/**
 * 一覧の 1 レコードの種別。WARC-Type のまま —— ただし resource は、`WARC-Target-URI` の頭で分ける。
 * BrowserHive WARC の resource は 3 つ在る: DOM の写し（読み込みの後とスクリプトの後）・枠の写し（同じ時点の、
 * 同じ origin の子フレームの文書。BrowserHive v31.2.0 から）・節目のスクリーンショット（BrowserHive v30.2.0 から）。
 * 頭がどれでもない resource（ほかの作り手の WARC など）は `resource` のまま。種別の絞りも、この値で分ける
 * （写し・枠の写し・絵を別々に数える）。
 */
export const recordKind = (row) => {
  if (row.type !== "resource") return row.type;
  const uri = row.uri ?? "";
  if (uri.startsWith(SNAPSHOT_URI)) return "resource:snapshot";
  if (uri.startsWith(FRAME_SNAPSHOT_URI)) return "resource:frame-snapshot";
  if (uri.startsWith(SCREENSHOT_URI)) return "resource:screenshot";
  return "resource";
};

/**
 * 読んだ窓の行を種別（`recordKind`）ごとに数える（WACZ の画面の種別の絞りのボタン）。Map の並びは、窓に初めて出た順。
 * 数は読んだ窓の中の数で、WARC 全体の数ではない。
 */
export const kindCounts = (rows) => {
  const counts = new Map();
  for (const row of rows) {
    const kind = recordKind(row);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

/** 行を種別で絞る。`kind` が undefined なら全部（「すべて」のボタン）。 */
export const rowsOfKind = (rows, kind) => (kind === undefined ? rows : rows.filter((row) => recordKind(row) === kind));

/**
 * 種別（`recordKind`）の言い方。知らない種別と、warcinfo と、頭で分けられない resource はそのまま。
 * 日本語の「記録」は metadata の言い直しで、英語は WARC-Type の名前のまま（レコードの record と同じ字にしない）。
 */
export const typeName = (kind) => {
  if (kind === "response") return t("wacz.type.response");
  if (kind === "request") return t("wacz.type.request");
  if (kind === "metadata") return t("wacz.type.metadata");
  if (kind === "resource:snapshot") return t("wacz.type.snapshot");
  if (kind === "resource:frame-snapshot") return t("wacz.type.frameSnapshot");
  if (kind === "resource:screenshot") return t("wacz.type.screenshot");
  return kind;
};

/** 一覧の 1 レコードの列（種別・状態・content-type・URI）。 */
export const recordCells = (row) => ({
  type: typeName(recordKind(row)),
  status: row.status === undefined ? "" : String(row.status),
  mime: row.mime ?? row.contentType ?? "",
  uri: row.uri ?? "",
  indexed: row.indexed,
});

// ── warcinfo ───────────────────────────────────────────────────────
/**
 * 報告の `warcinfo`（wacz-validator v0.39.0 から）のうち、この WARC の本の記録。本の中の順のまま。
 * 本に warcinfo が無いか、報告が `warcinfo` を持たない daemon なら、空の並び。
 */
export const warcinfoOf = (report, entryPath) => (report.warcinfo ?? []).filter((record) => record.entry === entryPath);

/** warcinfo の枠の見出し。本の何件目の記録で、いつ書かれたか。 */
export const warcinfoTag = (record) =>
  record.date === undefined
    ? t("wacz.warcinfo.tag", { n: record.index })
    : t("wacz.warcinfo.tagDated", { n: record.index, date: record.date });

/**
 * 本文を欄に分けなかった記録の言い方（分けた記録は undefined）。分けるのは、`Content-Type` が
 * `application/warc-fields` で、大きすぎない本文だけ（どこまでが大きすぎないかは検証器が決める）。
 */
export const warcinfoNote = (record) => {
  if (record.fields !== undefined) return undefined;
  return record.contentType === undefined || record.contentType === null
    ? t("wacz.warcinfo.notSplitNoType")
    : t("wacz.warcinfo.notSplit", { contentType: record.contentType });
};

/** 本文の言い方（text は本文そのものなので、ここでは扱わない）。 */
export const bodyLabel = (body) => {
  if (body.kind === "image") return `${body.mime} · ${formatBytes(body.byteLength)}`;
  if (body.kind === "binary") return `(binary${body.mime === undefined ? "" : ` · ${body.mime}`} · ${formatBytes(body.byteLength)})`;
  return body.truncated ? t("wacz.record.bodyCut") : "";
};

/**
 * 索引（CDXJ）の 1 行の fields から、開くレコードの位置を取る。
 * `filename` は `archive/` からの相対（WACZ の慣習）。揃っていなければ undefined。
 */
export const recordOpener = (fields) => {
  const value = (label) => fields.find((f) => f.label === label)?.value;
  const filename = value("filename");
  const offset = Number(value("offset"));
  const length = Number(value("length"));
  if (filename === undefined || !Number.isInteger(offset) || !Number.isInteger(length) || length <= 0) return undefined;
  return { path: `archive/${filename}`, offset, length };
};

/** 画面の URL。`#wacz/<archiveId>` に、選んだ entry と行を足せる。 */
export const waczHash = (archiveId, path, n) =>
  `#wacz/${encodeURIComponent(archiveId)}` +
  (path === undefined ? "" : `/${encodeURIComponent(path)}`) +
  (n === undefined ? "" : `:${String(n)}`);

/** `#wacz/<archiveId>[/<path>[:<n>]]` を読む。合わなければ undefined。 */
export const parseWaczHash = (hash) => {
  const m = /^#wacz\/([^/]+)(?:\/([^:]+)(?::(\d+))?)?$/.exec(hash);
  if (m === null) return undefined;
  try {
    return {
      archiveId: decodeURIComponent(m[1]),
      path: m[2] === undefined ? undefined : decodeURIComponent(m[2]),
      n: m[3] === undefined ? undefined : Number(m[3]),
    };
  } catch {
    return undefined;
  }
};
