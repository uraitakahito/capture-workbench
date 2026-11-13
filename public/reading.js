/**
 * スクリプト集の画面（読む所）の部品。**workbench から切り出してあるのは、ここだけ試験から呼べるようにするため。**
 *
 * ブラウザは `/reading.js` として読み、試験は `node --test` から import する —— 同じファイルを
 * 両方が読むので、写しが腐ることがない。import は隣の `./i18n.js` だけ（`/format.js` のような根からの path は、
 * node では fs の根になる）。読み込んだときに DOM に触らず、字も作らない（字は、呼ばれたときに辞書から引く）。
 *
 * 読む物は 2 種類: スクリプトの 1 版（`GET /api/scripts/:id/versions/:version`）と、受け皿 `__bh` の型
 * （`GET /api/host-types`）。どちらも JS にする前の TypeScript で、走った JS（アーカイブの
 * `behaviors/custom.jsonl`）とは行が合わない。
 */
import { t } from "./i18n.js";

/** 受け皿の型の URL。スクリプトの id は encodeURIComponent してから載せるので `/` を含まず、取り違えない */
export const TYPES_HASH = "#scripts/types/host.d.ts";

const num = (s) => (s === undefined ? undefined : Number(s));

/**
 * 読む物の URL。版を省けば「いま既定で走る版」。`sha` は「このクロールが走らせた物」の sha256 の頭で、
 * クロールの「読む」だけが付ける —— 版の番号は、消して足し直すと別の中身に使い回される。
 * `id` を省けば受け皿の型。
 */
export const readingHash = ({ id, version, sha, line }) =>
  (id === undefined
    ? TYPES_HASH
    : `#scripts/${encodeURIComponent(id)}` +
      (version === undefined ? "" : `@${String(version)}`) +
      (version === undefined || sha === undefined ? "" : `~${sha}`)) +
  (line === undefined ? "" : `:${String(line)}`);

/**
 * `#scripts/<id>[@<版>[~<sha の頭>]][:<行>]` と `#scripts/types/host.d.ts[:<行>]` を読む。
 * 合わなければ undefined。型は `{ line }` だけ（`id` が無い）。
 */
export const parseReading = (hash) => {
  const types = /^#scripts\/types\/host\.d\.ts(?::(\d+))?$/.exec(hash);
  if (types !== null) return { line: num(types[1]) };
  const m = /^#scripts\/([^/@:~]+)(?:@(\d+)(?:~([0-9a-f]{6,64}))?)?(?::(\d+))?$/.exec(hash);
  if (m === null) return undefined;
  try {
    return { id: decodeURIComponent(m[1]), version: num(m[2]), sha: m[3], line: num(m[4]) };
  } catch {
    return undefined; // 壊れた %xx
  }
};

/** 読む物の短い名前（新しいクロールの右の列のタブ）。`autoscroll v2`、型は `host.d.ts`。 */
export const labelOf = ({ id, version }) =>
  id === undefined ? "host.d.ts" : version === undefined ? id : `${id} v${String(version)}`;

/** 行に分ける。最後の改行の後ろの空の 1 行は数えない（wc -l と同じ。autoscroll.ts は 55 行） */
export const linesOf = (source) => {
  const lines = source.split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
};

/**
 * 見出しの下の 1 行の、事実の部分。`behavior · 55 行 · 2,695 バイト · sha256 c9956819ffea… ·
 * 2026-10-14 取り込み`。型は phase を持たないので、その欄が無い。数は 3 桁ずつ区切る（辞書の `{n, number}`。
 * 画面のほかの数と同じ）。日付は手元の暦（画面のほかの時刻と同じ）で、形は言語で変えない。
 */
export const metaOf = (doc) => [
  ...(doc.phase === undefined ? [] : [doc.phase]),
  t("scripts.meta.lines", { n: linesOf(doc.source).length }),
  t("scripts.meta.bytes", { n: doc.bytes }),
  `sha256 ${doc.sha256.slice(0, 12)}…`,
  t("scripts.meta.imported", { date: new Date(doc.createdAt).toLocaleDateString("sv-SE") }),
];

/**
 * 渡す値。**空は「既定のまま」と言う** —— `{}` だけを見せると、値が無いのか、既定がどこに在るのかが
 * 読めない。既定値はスクリプトのコードの中にしか無い（capture-scripts の約束）。
 */
export const optionsText = (options) =>
  Object.keys(options ?? {}).length === 0
    ? t("scripts.options.defaults")
    : t("scripts.options.given", { json: JSON.stringify(options) });

/**
 * その id で既定の顔ぶれに入る版。`latest` は `GET /api/scripts` の答え（id ごとに 1 行。既定に入らない id も
 * `enabled: false` で載る）。既定に入らない id と、載っていない id は undefined。
 */
export const defaultVersionOf = (latest, id) => {
  const script = latest.find((s) => s.id === id);
  return script?.enabled ? script.version : undefined;
};

/**
 * この版と既定の顔ぶれの関係。`defaultVersion` は `defaultVersionOf` の答え（既定に入らない id なら
 * undefined）。無効な版は、名指せば走るが、既定では走らない。サイト用のスクリプト（対象サイトのある版）が既定で
 * 走るのは、起点のどれかが対象サイトのホストにあるときだけ。
 */
export const standingOf = (doc, defaultVersion) => {
  if (doc.enabled === false) return { text: t("scripts.standing.disabled"), kind: "warn" };
  if (defaultVersion === doc.version) {
    return doc.sites.length === 0
      ? { text: t("scripts.standing.default"), kind: "ok" }
      : { text: t("scripts.standing.defaultOnSites", { sites: doc.sites.join(t("common.sep.dot")) }), kind: "ok" };
  }
  if (defaultVersion === undefined) return { text: t("scripts.standing.notDefault"), kind: "warn" };
  return { text: t("scripts.standing.other", { version: defaultVersion }), kind: "muted" };
};
