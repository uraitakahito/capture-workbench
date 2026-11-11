/**
 * 新しいクロールの画面の部品。**workbench から切り出してあるのは、ここだけ試験から呼べるようにするため。**
 *
 * ブラウザは `/start.js` として読み、試験は `node --test` から import する ——
 * 同じファイルを両方が読むので、写しが腐ることがない。
 *
 * **起点の URL は検査しない。** 読めない URL は台帳が 400 で言う。規則を 2 か所に持つと、
 * 片方だけが変わった日に、workbench が通すのに台帳が断る（または逆）形になる。
 */

/** 走らせるものの欄が、何も選んでいない形（台帳にスクリプトが無く、その場の TS も無い）。 */
const NOTHING_CHOSEN = {
  order: [],
  picked: [],
  defaults: [],
  inline: { name: "", phase: "behavior", source: "" },
};

/**
 * 起点の欄から、ホスト名の集合。**台帳と同じく `new URL(…).hostname`** —— 小文字になり、IDN は
 * punycode になり、ポートは落ちる。読めない行は数えない（台帳が 400 で言う）。
 */
export const seedHosts = (text) =>
  new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && URL.canParse(line))
      .map((line) => new URL(line).hostname),
  );

/**
 * そのスクリプトを、この起点で選べるか。**対象サイト（`sites`）が無ければいつでも**、あれば対象サイトのどれかが起点の
 * ホストにあるとき（完全一致。`example.com` と `www.example.com` は別）。台帳（capture-ledger
 * v0.61.0）の決まりの写しで、正は台帳 —— 合わない物を名指せば、台帳が 400 で断る。
 */
export const onSeed = (script, hosts) =>
  script.sites.length === 0 || script.sites.some((site) => hosts.has(site));

/**
 * ふつうに押したか（左のボタンだけ・修飾キーなし）。チェックの横の「読む」は、このときだけ右の列で開く。
 * それ以外はブラウザに任せる（href はスクリプト集の画面なので、別のタブで開くなど）。
 */
export const plainClick = (event) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * 起点と台帳の既定（`enabled`）で決まる顔ぶれ —— 台帳が `scripts` を省いた頼みに選ぶ物と同じ。並びは台帳の並び。
 * 既定に入らないスクリプト（`enabled: false`。カタログの `default: false`）は、起点に合っても入らない。
 */
export const defaultIds = (scripts, hosts) =>
  scripts.filter((script) => script.enabled && onSeed(script, hosts)).map((script) => script.id);

/** 走る順の中で、その場の TS の位置を指す印。スクリプトの id にはならない綴り（id は英小文字で始まる）。 */
export const INLINE_ROW = "@inline";

/**
 * 走る順（`INLINE_ROW` とスクリプトの id の並び）。人が ↑↓ で動かす前（`moved` が undefined）は、その場の TS が
 * 先頭で、スクリプトは台帳の並び —— 台帳の順が変われば付いていく。動かした後は人の決めた順を保ち、台帳に新しく
 * 現れた id は後ろへ足す。チェックの外れた行も順の中に居る（付け直せば元の位置に戻る）。
 */
export const orderOf = (moved, ids) =>
  moved === undefined
    ? [INLINE_ROW, ...ids]
    : [...moved.filter((id) => id === INLINE_ROW || ids.includes(id)), ...ids.filter((id) => !moved.includes(id))];

/** その場の TS を書いたか。空白だけなら書いていない。 */
const written = (inline) => inline.source.trim() !== "";

/**
 * 走る物を、走る順に（画面で番号の付く行）。起点に合ってチェックの付いたスクリプトと、読み込みの後に走るその場の TS。
 * 遷移の前に走るその場の TS は入らない —— ページの読み込みより前に入るので、順を選ぶ意味が無い（送るときは先頭）。
 *
 * 台帳のスクリプトの `phase` は見ない。いまカタログに遷移の前に走る物は無い。足す日には、番号が走る順でなくなる。
 */
export const liveOrder = ({ order, picked, inline }) =>
  order.filter((id) => (id === INLINE_ROW ? written(inline) && inline.phase === "behavior" : picked.includes(id)));

/**
 * 走る物 `id` を `delta`（-1 か 1）だけ動かした順。相手は隣の走る物で、間の走らない行（チェックの外れた行など）は
 * その位置に残る。端を越えるなら同じ順。
 */
export const movedOrder = (run, id, delta) => {
  const live = liveOrder(run);
  const other = live[live.indexOf(id) + delta];
  if (other === undefined) return run.order;
  return run.order.map((row) => (row === id ? other : row === other ? id : row));
};

/**
 * 画面の行の並び。走る順のまま（チェックでは行が動かない —— 次の行が手の下に来ないように）で、起点に合わない
 * サイト用のスクリプトだけ下へまとめる（押せない行が押せる行の間に挟まらないように）。
 */
export const shownOrder = (order, scripts, hosts) => {
  const off = scripts.filter((script) => !onSeed(script, hosts)).map((script) => script.id);
  return [...order.filter((id) => !off.includes(id)), ...order.filter((id) => off.includes(id))];
};

/**
 * 走らせるもの（台帳の `scripts`）。**既定のまま —— 走るスクリプトが既定の顔ぶれ（`defaultIds`）と同じ物を同じ順で、
 * その場の TS が空 —— なら送らない**（`undefined`）。台帳も起点から同じ物を同じ順で選ぶので、省いても走る物は
 * 変わらない。省くのは、台帳にスクリプトが無いときと、起点に合う物が無いときの 400 を台帳に言わせるため。
 *
 * 送るときは `liveOrder` のとおり —— 画面の番号の順で、遷移の前に走るその場の TS だけ先頭に。全部外せば `[]` ——
 * 「何も走らせない」。source は削らない —— 台帳が打つ sha256 は、書いたバイト列の物。名前は前後の
 * 空白だけ落とす。綴りは検査しない（台帳が 400 で言う）。
 */
export const scriptsOf = (run) => {
  const { defaults, inline } = run;
  const live = liveOrder(run);
  const asDefault = live.length === defaults.length && defaults.every((id, i) => live[i] === id);
  if (!written(inline) && asDefault) return undefined;
  const item = { inline: { name: inline.name.trim(), phase: inline.phase, source: inline.source } };
  return [
    ...(written(inline) && inline.phase === "preload" ? [item] : []),
    ...live.map((id) => (id === INLINE_ROW ? item : { catalog: id })),
  ];
};

/**
 * チェックしたスクリプトが宣言した、クロールごとの値（capture-scripts の `catalog.json` の `params`。台帳の
 * `GET /api/scripts` が版ごとに運ぶ）。`kind`（`variable` か `secret`）で選び、**同じ名前は 1 つにまとめる** ——
 * 名前の空間は 1 クロールに 1 つ（台帳の決まり）で、2 本のスクリプトが同じ名前を宣言すれば同じ値を読む。必須はどれかが
 * 必須なら必須、説明と値の形（`schema`）と WARC に残すか（`archive`）は最初の宣言の物、`by` は宣言したスクリプトの id。
 * 並びは台帳の並びに宣言の順。`archive` はシークレットだけが持ち、省いた宣言は `null`（隠す。capture-scripts/6 の決まり）に
 * 揃える —— クロールの行の答え（capture-ledger v0.90.0）と同じ形で、`format.js` の `secretArchiveOf` が両方を読む。
 * 別の形で宣言していても（残すかどうかが違っても）、ここでは断らない（台帳が 400 `conflicting params` で言う）。
 * `params` を運ばない台帳（v0.66 まで）の行は、何も宣言していないとして読む。
 */
export const declaredOf = (scripts, picked, kind) => {
  const out = [];
  for (const script of scripts) {
    if (!picked.includes(script.id)) continue;
    for (const param of script.params ?? []) {
      if (param.kind !== kind) continue;
      const seen = out.find((d) => d.name === param.name);
      if (seen === undefined) {
        out.push({
          name: param.name,
          required: param.required === true,
          summary: param.summary ?? "",
          ...(param.schema === undefined ? {} : { schema: param.schema }),
          ...(kind === "secret" && { archive: param.archive ?? null }),
          by: [script.id],
        });
      } else {
        seen.required = seen.required || param.required === true;
        seen.by.push(script.id);
      }
    }
  }
  return out;
};

/**
 * 欄に出す宣言。チェックしたスクリプトの宣言（`declaredOf`）の前に、その場の TS が `defineParams` で宣言した変数
 * （`inlineParams`。台帳の `POST /api/scripts/check` の答え）を足す。**箱が空なら足さない** —— 消した TS の答えを残さない。
 * 画面の `drawValues` と `variablesNow` の両方がここを読む（片方だけだと、欄は出るのに値が送られない）。
 */
export const declaredWith = (scripts, picked, inline, inlineParams, kind) =>
  written(inline)
    ? declaredOf([{ id: INLINE_ROW, params: inlineParams }, ...scripts], [INLINE_ROW, ...picked], kind)
    : declaredOf(scripts, picked, kind);

/**
 * `POST /api/scripts/check` の答えを、欄の宣言と箱の下の 1 行（`note`。無ければ空）にする。
 *
 * 言うのは**欄が出ない理由**だけ: 宣言を読めない（`BH0002`）・遷移の前では宣言できない（`BH0004`）・確かめられなかった。
 * ふつうの型の誤りは言わない —— 打っている途中の TS はたいてい誤りを持ち、走らせれば compile の段が言う。
 */
export const inlineDeclared = (status, body) => {
  if (status === 200 && Array.isArray(body?.params)) {
    const blocking = (body.diagnostics ?? []).filter((d) => d.code === "BH0002" || d.code === "BH0004");
    return { params: body.params, note: blocking.map((d) => `${String(d.code)}: ${String(d.message)}`).join(" ／ ") };
  }
  const said = body?.message ?? body?.error ?? "答えに文がありません";
  return {
    params: [],
    note: status === 0 ? `workbench 自身に届きません（${said}）` : `宣言を確かめられません（${String(status)} —— ${said}）`,
  };
};

/**
 * 箱が止まってから訊く係。返す関数を、箱が変わるたびに呼ぶ。`current` は今の箱を文字列で返し、`ask` は投げずに答えを返す。
 *
 * - 変わるたびに待ち直す —— 打っている間は訊かない
 * - **走行中は 1 本だけ** —— 答えが来るまで次を送らない
 * - 訊いた後に箱が変わっていれば、答えは前の TS の物なので捨てて待ち直す。画面に届くのは今の箱の答えだけ
 */
export const askWhenSettled = ({ current, ask, answered, waitMs = 800 }) => {
  let timer;
  let asking = false;
  const run = async () => {
    if (asking) return; // 答えが来たところで、今の箱と比べる
    const asked = current();
    asking = true;
    const answer = await ask(asked);
    asking = false;
    if (asked === current()) answered(answer);
    else changed();
  };
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), waitMs);
  };
  return changed;
};

/**
 * 送る変数（台帳の `variables`）。**宣言された名前のうち、欄に値の在る物だけ。** 空白だけの欄は送らない ——
 * 送れば、スクリプトは「無い」（任意の変数なら undefined、必須の変数なら台帳の 400）ではなく空の文字列を読む。値は削らない。
 * 宣言から外れた名前の値（チェックを外した後も `values` に残る）は送らない。綴り・長さ・数は検査しない（台帳が 400 で言う）。
 */
export const variablesOf = (declared, values) =>
  Object.fromEntries(
    declared.map(({ name }) => [name, values.get(name) ?? ""]).filter(([, value]) => value.trim() !== ""),
  );

/** 起点の欄から、送る起点。空行を落とすだけ（URL は検査しない）。 */
const seedsOf = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** 動きと、画面の言い方。並びは選ぶ欄の並び。 */
export const ACTIONS = [
  ["follow", "撮って辿る"],
  ["capture", "撮るだけ"],
  ["skip", "落とす"],
];
const VERB = Object.fromEntries(ACTIONS);

/**
 * 型（よく使う並び）。**どれも「撮って辿る」を 1 本持つ** —— 起点が撮って辿るに当たらないと、台帳が
 * 400 で断る。行は `{ action, pattern }` で、表はこの形を描き、送るときに台帳の形（鍵が 1 つの object）にする。
 */
export const PRESETS = {
  site: [{ action: "follow", pattern: "same-site" }],
  siteAndOneHop: [
    { action: "follow", pattern: "same-site" },
    { action: "capture", pattern: "any" },
  ],
  host: [{ action: "follow", pattern: "same-host" }],
  any: [{ action: "follow", pattern: "any" }],
};

/**
 * 落とす行は**いちばん上**に足す。上から当て、最初に当たった規則が勝つので、広い「撮って辿る」の下に
 * 置くと覆われて二度と当たらない（台帳が 400 で断る）。
 */
export const addSkipRow = (rows) => [{ action: "skip", pattern: "" }, ...rows];

/** ふつうの行はいちばん下に。下の行ほど、上に当たらなかった物だけを受ける（外へ 1 歩、など）。 */
export const addRow = (rows) => [...rows, { action: "capture", pattern: "" }];

/** `i` 行目（0 から）を `delta` だけ動かす。端を越えるなら動かさない（同じ配列を返す）。 */
export const moveRow = (rows, i, delta) => {
  const j = i + delta;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

export const removeRow = (rows, i) => rows.filter((_, k) => k !== i);

/** 表の行から台帳の `rules`。当てる物は前後の空白だけ落とす（読めるかは台帳が言う）。 */
export const rulesOf = (rows) => rows.map(({ action, pattern }) => ({ [action]: pattern.trim() }));

/**
 * User-Agent の箱の字を、送る字にする。貼ったときの改行は空白にし、前後の空白を落とす。字の規則は台帳が持つので、
 * ここでは検査しない。
 */
export const userAgentOf = (text) => text.replace(/\s*\n\s*/g, " ").trim();

/**
 * 欄から台帳へ送る body。起点は空行を落とすだけ。
 *
 * 「このページだけ」（`follow` が null）なら `maxDepth: 0` を足す。「リンクを辿る」なら規則の並びを
 * 必ず送り、深さと枚数は書いたときだけ送る —— 空なら台帳の既定に任せ、既定の数を workbench に写さない。
 * 走らせるものは `scriptsOf`。クロールごとの変数（`variablesOf`）は、1 つでも在るときだけ送る（空の object は送らない）。
 * User-Agent（`userAgentOf`）も、書いたときだけ送る。
 */
export const startBody = (text, follow, run = NOTHING_CHOSEN, variables = {}, userAgentText = "") => {
  const scripts = scriptsOf(run);
  const userAgent = userAgentOf(userAgentText);
  return {
    seeds: seedsOf(text),
    ...(follow === null
      ? { maxDepth: 0 }
      : {
          ...(follow.maxDepth.trim() !== "" && { maxDepth: Number(follow.maxDepth) }),
          ...(follow.maxPages.trim() !== "" && { maxPages: Number(follow.maxPages) }),
          rules: rulesOf(follow.rows),
        }),
    ...(scripts !== undefined && { scripts }),
    ...(Object.keys(variables).length > 0 && { variables }),
    ...(userAgent !== "" && { userAgent }),
  };
};

/**
 * 台帳の確かめのエンドポイント（`GET /api/crawl-rules/check`）の query。起点は空行を落とし、規則は「動き:当てる物」で
 * 並べる（当てる物の `:` は、台帳が最初の 1 つで切るので構わない）。
 */
export const checkQuery = (text, rows) =>
  new URLSearchParams([
    ...seedsOf(text).map((seed) => ["seed", seed]),
    ...rows.map(({ action, pattern }) => ["rule", `${action}:${pattern.trim()}`]),
  ]).toString();

const KIND = { scope: "範囲", domain: "ドメイン（その下も）", prefix: "前方一致" };

/**
 * 確かめの答えから、行ごとの印（`{ text, bad }`）。**答えの行の数が表と違えば印を出さない** —— 表を
 * 変えた直後で、答えが前の表の物だから。
 */
export const marksOf = (answer, rowCount) => {
  if (answer === undefined || answer.rules.length !== rowCount) {
    return Array.from({ length: rowCount }, () => ({ text: "", bad: false }));
  }
  return answer.rules.map((rule) => {
    if (rule.kind === "invalid") {
      return { text: "読めません（小文字のホスト名・http(s) の URL・範囲の名前のどれか）", bad: true };
    }
    if (rule.coveredBy !== undefined) {
      return {
        text: `${String(rule.coveredBy)} 行目に覆われて当たりません。上へ移してください`,
        bad: true,
      };
    }
    return { text: KIND[rule.kind] ?? rule.kind, bad: false };
  });
};

/** 当てる物を文に。範囲の `same-site` は、起点のサイトの名前で言う。 */
const phraseOf = (rule, sites) => {
  if (rule.kind === "invalid") return `「${rule.pattern}」（読めない）`;
  if (rule.kind === "domain") return `${rule.pattern} とその下`;
  if (rule.kind === "prefix") return `${rule.pattern} で始まる URL`;
  switch (rule.pattern) {
    case "same-origin":
      return "起点と同じ origin";
    case "same-host":
      return "起点と同じホスト";
    case "same-site":
      return sites.length === 0 ? "起点と同じサイト" : `${sites.join("・")} の中`;
    default:
      return "どこでも";
  }
};

/**
 * 送る前に「何を辿るか」を言い直す文（`{ text, bad }`）。台帳の確かめの答えから組むので、言い方は台帳が
 * 読んだ形のまま（前方一致は正規化した URL）。始められない理由があれば最後に並べ、`bad` にする。
 */
export const summaryOf = (answer, follow) => {
  const sites = [
    ...new Set(answer.seeds.filter((seed) => seed.valid).map((seed) => seed.site)),
  ];
  const lines = answer.rules.map((rule) => {
    const phrase = phraseOf(rule, sites);
    const verb = VERB[rule.action];
    return rule.kind === "scope" && rule.pattern === "any"
      ? `${String(rule.rule)} 行目 どこでも${verb}`
      : // 英字で終わる物（URL・origin）と「は」の間は空ける（この repo の書き方）
        `${String(rule.rule)} 行目 ${phrase}${/[!-~]$/.test(phrase) ? " " : ""}は${verb}`;
  });
  const depth = follow.maxDepth.trim() === "" ? "台帳の既定の深さ" : `${follow.maxDepth.trim()} 段`;
  const pages = follow.maxPages.trim() === "" ? "台帳の既定の枚数" : `${follow.maxPages.trim()} 枚`;
  const problems = [
    ...answer.rules.flatMap((rule) =>
      rule.kind === "invalid"
        ? [`${String(rule.rule)} 行目の当てる物が読めません。`]
        : rule.coveredBy !== undefined
          ? [`${String(rule.rule)} 行目は ${String(rule.coveredBy)} 行目に覆われて当たりません。`]
          : [],
    ),
    ...answer.seeds.flatMap((seed) =>
      !seed.valid
        ? [`起点 ${seed.url} は http(s) の URL ではありません。`]
        : seed.followed
          ? []
          : [`起点 ${seed.url} は撮って辿る行に当たりません。`],
    ),
  ];
  const told =
    answer.rules.length === 0
      ? "規則がありません。"
      : `上の行から当てます。${lines.join("、")}。どれにも当たらないリンクは落とします。`;
  return {
    text: `${told}${depth}・${pages}まで。${problems.join("")}${problems.length > 0 ? "このままでは始められません。" : ""}`,
    bad: problems.length > 0 || answer.rules.length === 0,
  };
};

/**
 * 答えを 1 行で言う。**台帳の文は言い換えない** —— `message` を先に、無ければ `error` を拾い、
 * 名指した `ids` と `hint` があれば添える。
 *
 * `message` が先なのは、Fastify が自分で返す答え（route が無い 404、schema の 400）が
 * `error: "Not Found"` と `message: "Route POST:/api/crawls not found"` の両方を持ち、
 * 言いたいことは `message` の側に在るから。台帳が自分で書く答えは `error` だけ。
 *
 * `status` が 0 なのは、workbench のサーバ自身に届かなかったとき（fetch が投げた）。
 */
export const startAnswer = (status, answer) => {
  const id = typeof answer.crawlId === "string" ? `（crawl ${answer.crawlId.slice(0, 8)}）` : "";
  if (status === 202) return { kind: "ok", text: `クロール開始しました${id}。` };
  if (status === 409) {
    return { kind: "run", text: `走行中のクロールがあります${id}。終わるまで次は始められません。` };
  }
  const said = answer.message ?? answer.error ?? "答えに文がありません";
  if (status === 0) return { kind: "bad", text: `workbench 自身に届きません（${said}）` };
  // 台帳が名指した物（知らないスクリプトの id・重ね・辿らない起点・規則の行・変数やシークレットの名前・シークレットの
  // 名前と Windmill の path）。文の後、hint の前に。隠すシークレットと組めない形式の 400 は、形式を hint の中で言う
  const named = Array.isArray(answer.ids)
    ? answer.ids
    : Array.isArray(answer.names)
      ? answer.names
      : Array.isArray(answer.secrets)
        ? answer.secrets.map((s) => (s.path === undefined ? String(s.name) : `${String(s.name)}（${String(s.path)}）`))
        : typeof answer.script === "string" // 宣言の形が読めないその場の TS（invalid params）
          ? [answer.script]
          : Array.isArray(answer.seeds)
            ? answer.seeds
            : Array.isArray(answer.rules)
              ? answer.rules.map((r) =>
                  r.coveredBy === undefined
                    ? `${String(r.rule)} 行目（${String(r.pattern)}）`
                    : `${String(r.rule)} 行目（${String(r.coveredBy)} 行目に覆われる）`,
                )
              : [];
  const ids = named.length === 0 ? "" : `: ${named.join(", ")}`;
  const hint = typeof answer.hint === "string" ? `（${answer.hint}）` : "";
  return { kind: "bad", text: `${String(status)} —— ${said}${ids}${hint}` };
};

/**
 * 送る本文の大きさ（バイト）。**門と同じ数え方** —— 門は受けたバイトを数えるので、JSON にして
 * UTF-8 で数える（日本語は 1 字 3 バイト、改行の escape は 2 バイト）。
 */
export const bodyBytes = (body) => new TextEncoder().encode(JSON.stringify(body)).length;

/**
 * 欄の下の 1 行。行数は TS の、割合は送る本文の。**上限を超えたら押せない**（over）。
 * 上限は `/healthz` の `writeLimit`（workbench が知らなければ Infinity を渡し、門に任せる）。
 */
export const sizeOf = (source, bytes, limit) => ({
  lines: source === "" ? 0 : source.split("\n").length,
  bytes,
  percent: Math.min(100, Math.round((bytes / limit) * 100)),
  over: bytes > limit,
});

/** 型の検査を外す印。ts-compile-service は 1 行目のこれを見て、構文だけを見る。 */
export const NOCHECK = "// @ts-nocheck";

/** 1 行目が印か。行頭と行末の空白は許す。2 行目より後の印は数えない。 */
export const hasNocheck = (source) => source.split("\n", 1)[0].trim() === NOCHECK;

/**
 * 「型を検査しない」のチェックに合わせて、1 行目の印を足し引きする。**ほかの行は触らない**
 * —— 見えている物が送る物で、台帳が打つ sha256 もこの source の物になる。
 */
export const withNocheck = (source, on) => {
  if (on === hasNocheck(source)) return source;
  if (on) return `${NOCHECK}\n${source}`;
  const end = source.indexOf("\n");
  return end === -1 ? "" : source.slice(end + 1);
};

/**
 * スクリプト 1 本を、その場の TS の下敷きにする（スクリプト集の画面の「下敷きにする」）。**替えるのは 1 つの
 * 形だけ** —— `__bh.opts["<id>"]` の id を `inline-<名前>` に。台帳はその場の TS を `inline-<名前>` の id で
 * 走らせ、設定もその id の下に置くので、替えないと元の id の設定を読む。報告（`__bh.report(data)`）とログの行は
 * id を取らない —— 誰の行かは BrowserHive が付ける（capture-scripts v0.7.0 の受け皿から）。
 *
 * ほかの綴り（ログの文字列・コメントの地の文・`__bh.` の無い `opts["…"]`・別の id・report の引数）は触らない。
 * 替えた行の番号（1 から）を返す。名前の綴りは検査しない（台帳が 400 で言う）。
 */
export const asTemplate = (source, fromId, name) => {
  const from = `__bh.opts["${fromId}"]`;
  const into = `__bh.opts["inline-${name}"]`;
  const changed = [];
  const lines = source.split("\n").map((line, i) => {
    const out = line.split(from).join(into);
    if (out !== line) changed.push(i + 1);
    return out;
  });
  return { source: lines.join("\n"), changed };
};
