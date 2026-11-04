/**
 * 型で落ちたクロールの、型の誤りと直し方（CAPTURE-49）。**描くのは `app.js`** で、ここは答えの読み方と言い方だけ
 * （DOM に触らないので、`node --test` から直に呼べる）。
 *
 * 台帳の口は 2 つ:
 *
 * - `GET /api/crawls/:id/diagnostics` —— 行に固定した組み合わせを ts-compile-service に送り直した型の誤り。
 *   Claude は呼ばない。台帳が ts-compile の宛先を持たない配備には、口ごと無い（Fastify の 404）
 * - `POST /api/crawls/:id/inline/:name/fix` —— その場の JS の直し方を Claude に訊く。**検査に通った案だけ**が
 *   200 で返り、Claude を呼んだ答えには回数と費用が載る
 *
 * 台帳の文（`error`）は言い換えない。状態の数と一緒に、そのまま出す。
 */

/** 失敗の文が、型の検査で落ちたことを言うか（capture-scheduler の compile の段の文 `compile 422 CompileFailed: …`）。 */
export const failedOnTypes = (error) => typeof error === "string" && /(?:^|\]\s*)compile 422 /.test(error);

/** 台帳の答えの文。無ければそう言う。 */
const saidOf = (body) => body?.error ?? body?.message ?? "答えに文がありません";

/** 誤り 1 件の「どこ」（`2:18`）。行か列が無ければ、在る物だけ。 */
const atOf = (d) =>
  d.line === undefined ? "—" : d.col === undefined ? String(d.line) : `${String(d.line)}:${String(d.col)}`;

/**
 * 取り直した型の誤り（`GET /api/crawls/:id/diagnostics` の答え）を、描く形にする。
 *
 * - `{ kind: "errors", typescript, rows }` —— 誤りがある。`rows` の `script` は誤りの在るスクリプトの id
 *   （受け皿の型や lib の誤りは無く、`where` が file）
 * - `{ kind: "clean", typescript }` —— いまの組み合わせは型を通る（ts-compile-service の版が変わったときなど）
 * - `{ kind: "trouble", text }` —— 取り直せなかった。text は 1 行で出す
 */
export const diagnosisOf = (status, body) => {
  if (status === 200 && Array.isArray(body?.diagnostics)) {
    const typescript = String(body.typescript ?? "?");
    if (body.diagnostics.length === 0) return { kind: "clean", typescript };
    const rows = body.diagnostics.map((d) => ({
      script: d.script,
      where: d.script ?? d.file ?? "—",
      at: atOf(d),
      code: String(d.code),
      message: String(d.message),
    }));
    return { kind: "errors", typescript, rows };
  }
  if (status === 0) return { kind: "trouble", text: `dashboard 自身に届きません（${saidOf(body)}）` };
  // 口が無い 404（Fastify の既定の文は "Route GET:… not found"）。行が無い・見えない 404 は "not found"
  if (status === 404 && typeof body?.message === "string" && body.message.startsWith("Route ")) {
    return {
      kind: "trouble",
      text: "404 —— 台帳がこの口を出していません（CAPTURE_LEDGER_TS_COMPILE_URL の無い配備）",
    };
  }
  return { kind: "trouble", text: `${String(status)} —— ${saidOf(body)}` };
};

/** そのスクリプトに型の誤りがあるか（「直し方を訊く」を出すか）。 */
export const hasErrorsIn = (diagnosis, scriptId) =>
  diagnosis?.kind === "errors" && diagnosis.rows.some((row) => row.script === scriptId);

/** 回数と費用。Claude を呼んだ答えにだけ在る。 */
const spentOf = (body) => {
  const usd = body?.usage?.usd;
  const parts = [
    ...(typeof body?.rounds === "number" ? [`${String(body.rounds)} 往復`] : []),
    ...(typeof usd === "number" ? [`$${usd.toFixed(4)}`] : []),
  ];
  return parts.length === 0 ? "" : `（${parts.join("・")}）`;
};

/**
 * 直し方の答え（`POST …/fix`）の 1 行。200 は直した版が描けるので `kind: "ok"`、ほかは台帳の文をそのまま。
 * 上限（429）は、この月に使った額と上限を添える。
 */
export const fixAnswer = (status, body) => {
  if (status === 200) {
    const compiled = body?.compiled;
    const by =
      compiled === undefined
        ? "型の検査"
        : `TypeScript ${String(compiled.typescript)}・受け皿の型 ${String(compiled.hostTypes)} の検査`;
    return { kind: "ok", text: `${by}に通った直し${spentOf(body)}` };
  }
  if (status === 0) return { kind: "bad", text: `dashboard 自身に届きません（${saidOf(body)}）` };
  if (status === 429 && typeof body?.spentUsd === "number" && typeof body?.budgetUsd === "number") {
    return {
      kind: "bad",
      text: `429 —— ${saidOf(body)}（この月 $${body.spentUsd.toFixed(4)}・上限 $${String(body.budgetUsd)}。Claude は呼んでいません）`,
    };
  }
  return { kind: status === 409 ? "warn" : "bad", text: `${String(status)} —— ${saidOf(body)}${spentOf(body)}` };
};

/** 直した誤り 1 件の理由（`notes` の 1 件）。 */
export const noteText = (note) => `${String(note.code)}（${String(note.line)} 行目）: ${String(note.why)}`;

/**
 * 直しの差分（`edits` = 置き換えた範囲ごとの `before` と `after`）を、描く行にする。消した行は元の行番号、
 * 足した行は直した版の行番号で数える（前の範囲で増えた・減った行の数を足して）。
 */
export const diffOf = (edits) => {
  let shift = 0;
  return (edits ?? []).map((edit) => {
    const start = edit.from + shift;
    shift += edit.after.length - edit.before.length;
    return {
      title: edit.from === edit.to ? `${String(edit.from)} 行目` : `${String(edit.from)}〜${String(edit.to)} 行目`,
      lines: [
        ...edit.before.map((text, i) => ({ sign: "-", no: edit.from + i, text })),
        ...edit.after.map((text, i) => ({ sign: "+", no: start + i, text })),
      ],
    };
  });
};
