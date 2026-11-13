/**
 * スクリプト集の画面（読む所）の部品（`public/reading.js`）。URL の読み書き・行の数え方・見出しの文。
 *
 * 画面そのもの（一覧・本文・押した行）は `app.js` に在り、試験は import しない。代役で開いて見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

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
} from "../public/reading.js";
import { setLang, t } from "../public/i18n.js";

/** 英語で 1 度だけ呼ぶ。終わったら日本語に戻す（ほかの試験は日本語を期待している）。 */
const inEnglish = (fn) => {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("ja");
  }
};

test("URL は書いて読むと元に戻る（版を省く・版・版と sha の頭と行・型の 4 つの形）", () => {
  const forms = [
    { id: "autoscroll" },
    { id: "autoscroll", version: 2 },
    { id: "autoscroll", version: 1, sha: "c9956819ffea", line: 33 },
  ];
  for (const target of forms) {
    const back = parseReading(readingHash(target));
    assert.deepEqual(
      Object.fromEntries(Object.entries(back).filter(([, v]) => v !== undefined)),
      target,
    );
  }
  assert.equal(readingHash({ line: 12 }), "#scripts/types/host.d.ts:12");
  assert.deepEqual(parseReading(readingHash({})), { line: undefined });
  assert.equal(readingHash({}), TYPES_HASH);
});

test("/ と空白を含む id は % にして載せ、読むと元の id に戻る", () => {
  const hash = readingHash({ id: "a/b c", version: 3 });
  assert.equal(hash, "#scripts/a%2Fb%20c@3");
  assert.equal(parseReading(hash).id, "a/b c");
});

test("受け皿の型と、id が types のスクリプトを取り違えない", () => {
  assert.deepEqual(parseReading("#scripts/types/host.d.ts:12"), { line: 12 });
  assert.equal(parseReading("#scripts/types").id, "types");
  // id の中の / は % になるので、型の URL にはならない
  assert.equal(parseReading(readingHash({ id: "types/host.d.ts" })).id, "types/host.d.ts");
  // 型の URL に似ているが型ではない path は、id としても読まない
  assert.equal(parseReading("#scripts/types/other.d.ts"), undefined);
});

test("合わない形は undefined（壊れた %・版の無い sha・ほかの画面の URL）", () => {
  assert.equal(parseReading("#scripts/%E0"), undefined);
  assert.equal(parseReading("#scripts/autoscroll~c9956819ffea"), undefined);
  assert.equal(parseReading("#scripts/autoscroll@1~XYZ"), undefined);
  assert.equal(parseReading("#wacz/1234/behaviors/custom.jsonl:2"), undefined);
  assert.equal(parseReading("#scripts"), undefined);
  assert.equal(parseReading("#scripts/"), undefined);
});

test("sha の頭は版があるときだけ載せる（版の無い URL は既定の版を指し、確かめる相手が無い）", () => {
  assert.equal(readingHash({ id: "autofetch", sha: "6aa6f4459d92" }), "#scripts/autofetch");
});

test("行は改行で数え、最後の改行の後ろの空の 1 行は数えない", () => {
  assert.equal(linesOf("a\nb\n").length, 2);
  assert.equal(linesOf("a\nb").length, 2);
  assert.deepEqual(linesOf(""), [""]);
  assert.deepEqual(linesOf("a\n\n"), ["a", ""]);
});

test("見出しの文: 数は 3 桁ずつ、型は phase を持たない", () => {
  const doc = {
    phase: "behavior",
    source: "x\n".repeat(55),
    bytes: 2695,
    sha256: "c9956819ffeadf3aa1cd138247330e1662372c2d47d4416bfefd4848e1bedc03",
    createdAt: "2026-10-14T12:26:38.656Z",
  };
  assert.deepEqual(metaOf(doc), [
    "behavior",
    "55 行",
    "2,695 バイト",
    "sha256 c9956819ffea…",
    "2026-10-14 取り込み",
  ]);
  const { phase: _phase, ...types } = doc;
  assert.equal(metaOf(types)[0], "55 行");
});

test("渡す値が空なら「既定のまま」と言い、あればそのまま見せる", () => {
  assert.equal(optionsText({}), "設定 {}（既定のまま。値はコードの中）");
  assert.equal(optionsText(undefined), "設定 {}（既定のまま。値はコードの中）");
  assert.equal(optionsText({ maxSteps: 60 }), '設定 {"maxSteps":60}');
});

test("既定の版は、capture-ledger の一覧で既定に入る物の版。既定に入らない id と載っていない id は無い", () => {
  const latest = [
    { id: "autoscroll", version: 2, enabled: true, sites: [] },
    { id: "autofetch", version: 1, enabled: false, sites: [] },
  ];
  assert.equal(defaultVersionOf(latest, "autoscroll"), 2);
  assert.equal(defaultVersionOf(latest, "autofetch"), undefined);
  assert.equal(defaultVersionOf(latest, "nothing"), undefined);
});

test("既定の顔ぶれとの関係を 3 通りに言う（既定の版・ほかの版が既定・無効）", () => {
  assert.deepEqual(standingOf({ version: 2, enabled: true, sites: [] }, 2), { text: "既定で走る版", kind: "ok" });
  assert.deepEqual(standingOf({ version: 1, enabled: true, sites: [] }, 2), {
    text: "既定で走るのは v2",
    kind: "muted",
  });
  assert.deepEqual(standingOf({ version: 1, enabled: false, sites: [] }, 2), {
    text: "無効（既定では走らない）",
    kind: "warn",
  });
});

test("サイト用のスクリプトの既定の版は、起点が対象サイトのホストにあるときだけ既定で走ると言う", () => {
  assert.deepEqual(standingOf({ version: 1, enabled: true, sites: ["site.test", "www.site.test"] }, 1), {
    text: "起点に site.test・www.site.test があれば既定で走る版",
    kind: "ok",
  });
});

test("読む窓のタブの名前は id と版（型は host.d.ts）。URL から読んだ物をそのまま渡せる", () => {
  assert.equal(labelOf(parseReading("#scripts/autoscroll@2")), "autoscroll v2");
  assert.equal(labelOf(parseReading("#scripts/autofetch")), "autofetch");
  assert.equal(labelOf(parseReading(TYPES_HASH)), "host.d.ts");
});

test("英語の見出しの文: 行とバイトは単数と複数を分け、桁を区切る。日付の形は変えない", () => {
  const doc = (lines, bytes) => ({
    phase: "behavior",
    source: "x\n".repeat(lines),
    bytes,
    sha256: "c9956819ffeadf3aa1cd138247330e1662372c2d47d4416bfefd4848e1bedc03",
    createdAt: "2026-10-14T12:26:38.656Z",
  });
  assert.deepEqual(inEnglish(() => metaOf(doc(1, 1))), [
    "behavior",
    "1 line",
    "1 byte",
    "sha256 c9956819ffea…",
    "imported 2026-10-14",
  ]);
  assert.deepEqual(inEnglish(() => metaOf(doc(2, 2695)).slice(1, 3)), ["2 lines", "2,695 bytes"]);
  assert.deepEqual(inEnglish(() => metaOf(doc(6061, 0)).slice(1, 3)), ["6,061 lines", "0 bytes"]);
  // 日本語も同じ桁区切り
  assert.deepEqual(metaOf(doc(6061, 12345)).slice(1, 3), ["6,061 行", "12,345 バイト"]);
});

test("英語の渡す値: 空の {} は字として出る（埋め込みと読まない）", () => {
  assert.equal(inEnglish(() => optionsText({})), "options {} (the defaults written in the code)");
  assert.equal(inEnglish(() => optionsText({ maxSteps: 60 })), 'options {"maxSteps":60}');
});

test("英語の、既定の顔ぶれとの関係（5 通り）", () => {
  const said = (doc, defaultVersion) => inEnglish(() => standingOf(doc, defaultVersion));
  assert.deepEqual(said({ version: 2, enabled: true, sites: [] }, 2), {
    text: "The version that runs by default",
    kind: "ok",
  });
  assert.deepEqual(said({ version: 1, enabled: true, sites: ["site.test", "www.site.test"] }, 1), {
    text: "Runs by default when a seed is on site.test · www.site.test",
    kind: "ok",
  });
  assert.deepEqual(said({ version: 1, enabled: true, sites: [] }, 2), {
    text: "v2 is the version that runs by default",
    kind: "muted",
  });
  assert.deepEqual(said({ version: 1, enabled: true, sites: [] }, undefined), {
    text: "Not in the default set",
    kind: "warn",
  });
  assert.deepEqual(said({ version: 1, enabled: false, sites: [] }, 2), {
    text: "Disabled (does not run by default)",
    kind: "warn",
  });
  // 日本語の 4 つ目（既定に入らない id の、有効な版）
  assert.equal(standingOf({ version: 1, enabled: true, sites: [] }, undefined).text, "既定には入っていない");
});

test("画面（app.js）が引く字: 版のリンクの印・書きかけの確認の行の数・下敷きの文の繋ぎ", () => {
  assert.equal(t("scripts.chip.default", { version: 2 }), "v2（既定）");
  assert.equal(t("scripts.chip.disabled", { version: 1 }), "v1（無効）");
  assert.equal(inEnglish(() => t("scripts.chip.default", { version: 2 })), "v2 (default)");
  assert.equal(inEnglish(() => t("scripts.chip.disabled", { version: 1 })), "v1 (disabled)");
  assert.equal(t("scripts.replace.ask", { n: 1234 }), "新しいクロールの欄に書きかけの TS（1,234 行）があります。");
  const ask = (n) => inEnglish(() => t("scripts.replace.ask", { n }));
  assert.equal(ask(1), "The form in the new crawl view holds an unfinished script (1 line).");
  assert.equal(ask(1234), "The form in the new crawl view holds an unfinished script (1,234 lines).");
  // 文と文の間: 日本語は詰め、英語は空白
  const told = () =>
    [
      t("scripts.template.copied", { id: "autoscroll", version: 2 }),
      t("scripts.template.changedLine", { line: 33, name: "my-autoscroll" }),
    ].join(t("common.sep.sentence"));
  assert.equal(told(), "下敷き: autoscroll v2 を写しました。33 行目の id を inline-my-autoscroll に替えました。");
  assert.equal(inEnglish(told), "Template: copied autoscroll v2. Changed the id on line 33 to inline-my-autoscroll.");
});
