/**
 * 型で落ちたクロールの、型の誤りと直し方（CAPTURE-49）。**描くのは `app.js`** で、ここは答えの読み方と言い方だけ
 * （DOM に触らないので、`node --test` から直に呼べる）。
 *
 * capture-ledger のエンドポイントは 2 つ:
 *
 * - `GET /api/crawls/:id/diagnostics` —— 行に固定した組み合わせを ts-compile-service に送り直した型の誤り。
 *   Claude は呼ばない。capture-ledger が ts-compile の宛先を持たない配備には、エンドポイントごと無い（Fastify の 404）
 * - `POST /api/crawls/:id/inline/:name/fix` —— その場の TS の直し方を Claude に訊く。**検査に通った案だけ**が
 *   200 で返り、Claude を呼んだ答えには回数と費用が載る
 *
 * capture-ledger の文（`error`）は言い換えない。状態の数と一緒に、そのまま出す。字は辞書（`i18n/*.json`）に在る。
 */
import { errorText, t } from "./i18n.js";

/** 失敗の文が、型の検査で落ちたことを言うか（capture-scheduler の compile の段の文 `compile 422 CompileFailed: …`）。 */
export const failedOnTypes = (error) => typeof error === "string" && /(?:^|\]\s*)compile 422 /.test(error);

/** capture-ledger の答えの文。無ければそう言う。 */
const saidOf = (body) => errorText(body) ?? t("common.noText");

/**
 * エンドポイントが無い 404 か（Fastify の既定の文は "Route GET:… not found"）。行が無い・見えない 404 は "not found" で、
 * こちらは capture-ledger がそのエンドポイントを出していない —— どちらのエンドポイントも、capture-ledger の設定が無ければエンドポイントごと出さない。
 */
const routeMissing = (status, body) =>
  status === 404 && typeof body?.message === "string" && body.message.startsWith("Route ");

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
  if (status === 0) return { kind: "trouble", text: t("common.unreachable", { said: saidOf(body) }) };
  if (routeMissing(status, body)) {
    return { kind: "trouble", text: t("crawls.diag.noRoute") };
  }
  return { kind: "trouble", text: t("crawls.diag.statusSaid", { status, said: saidOf(body) }) };
};

/** 必須の変数が足りない行か（`BH0001`）。TS の誤りではなく、値を渡せば通る。 */
export const lacksValues = (diagnosis) =>
  diagnosis?.kind === "errors" && diagnosis.rows.some((row) => row.code === "BH0001");

/**
 * そのスクリプトに型の誤りがあるか（「直し方を訊く」を出すか）。**足りない変数が 1 つでも在れば出さない** —— capture-ledger の
 * 直し方のエンドポイントは、クロールのどこかに `BH0001` があれば Claude を呼ばず 422 で断る（通る案は必須を任意にする形だけになるため）。
 */
export const hasErrorsIn = (diagnosis, scriptId) =>
  diagnosis?.kind === "errors" && !lacksValues(diagnosis) && diagnosis.rows.some((row) => row.script === scriptId);

/** 回数と費用。Claude を呼んだ答えにだけ在る。括弧まで含めた 1 つの文で、答えの文の後ろに値として渡す（無ければ空）。 */
const spentOf = (body) => {
  const usd = body?.usage?.usd;
  const parts = [
    ...(typeof body?.rounds === "number" ? [t("crawls.fix.rounds", { n: body.rounds })] : []),
    ...(typeof usd === "number" ? [`$${usd.toFixed(4)}`] : []),
  ];
  return parts.length === 0 ? "" : t("crawls.fix.spent", { parts: parts.join(t("common.sep.dot")) });
};

/**
 * 直し方の答え（`POST …/fix`）の 1 行。200 は直した版が描けるので `kind: "ok"`、ほかは capture-ledger の文をそのまま。
 * 上限（429）は、この月に使った額と上限を添える。
 */
export const fixAnswer = (status, body) => {
  if (status === 200) {
    const compiled = body?.compiled;
    const spent = spentOf(body);
    const text =
      compiled === undefined
        ? t("crawls.fix.passedTypes", { spent })
        : t("crawls.fix.passedCompiled", {
            typescript: String(compiled.typescript),
            hostTypes: String(compiled.hostTypes),
            spent,
          });
    return { kind: "ok", text };
  }
  if (status === 0) return { kind: "bad", text: t("common.unreachable", { said: saidOf(body) }) };
  if (routeMissing(status, body)) return { kind: "bad", text: t("crawls.fix.noRoute") };
  if (status === 429 && typeof body?.spentUsd === "number" && typeof body?.budgetUsd === "number") {
    return {
      kind: "bad",
      text: t("crawls.fix.budget", {
        said: saidOf(body),
        spentUsd: body.spentUsd.toFixed(4),
        budgetUsd: String(body.budgetUsd),
      }),
    };
  }
  return {
    kind: status === 409 ? "warn" : "bad",
    text: t("crawls.fix.statusSaid", { status, said: saidOf(body), spent: spentOf(body) }),
  };
};

/** 直した誤り 1 件の理由（`notes` の 1 件）。 */
export const noteText = (note) =>
  t("crawls.fix.note", { code: String(note.code), line: String(note.line), why: String(note.why) });

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
      title:
        edit.from === edit.to
          ? t("crawls.fix.diffLine", { from: edit.from })
          : t("crawls.fix.diffRange", { from: edit.from, to: edit.to }),
      lines: [
        ...edit.before.map((text, i) => ({ sign: "-", no: edit.from + i, text })),
        ...edit.after.map((text, i) => ({ sign: "+", no: start + i, text })),
      ],
    };
  });
};
