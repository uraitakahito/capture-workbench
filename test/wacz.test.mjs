/**
 * `/wacz/` のエンドポイントの純粋な部分。経路の読み、引数の組み替え、そして**署名が外に出ないこと**。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Told } from "../src/lib.mjs";
import { BadRequest, OPS, paramsFor, parseWaczRoute, viaSignedUrl } from "../src/wacz.mjs";

test("6 本のエンドポイントを読み、それ以外は読まない", () => {
  const ops = ["validate", "lines", "line", "records", "record", "record/body"];
  // OPS は docs の表と突き合わされる名前。OPS から作ると恒真になるので、この写しと比べる
  assert.deepEqual([...OPS].sort(), [...ops].sort());
  for (const op of ops) {
    assert.equal(parseWaczRoute(`/wacz/abc/${op}`)?.op, op, op);
    assert.equal(parseWaczRoute(`/wacz/abc/${op}`)?.archiveId, "abc");
  }
  assert.equal(parseWaczRoute("/wacz/abc/other"), undefined);
  assert.equal(parseWaczRoute("/wacz/abc"), undefined);
  assert.equal(parseWaczRoute("/api/archives"), undefined);
  assert.equal(parseWaczRoute("/wacz/abc/record/body/extra"), undefined);
});

test("path は decode し、数は数に、無いものは undefined", () => {
  const route = parseWaczRoute("/wacz/a%2Fb/lines?path=indexes%2Findex.cdxj&from=200&count=200");
  assert.equal(route?.archiveId, "a/b");
  assert.deepEqual(route?.params, {
    path: "indexes/index.cdxj",
    from: 200,
    count: 200,
    n: undefined,
    offset: undefined,
    length: undefined,
    locale: undefined,
  });
  // 検証の報告の言語。空は無いのと同じ
  assert.equal(parseWaczRoute("/wacz/x/validate?locale=en")?.params.locale, "en");
  assert.equal(parseWaczRoute("/wacz/x/validate?locale=")?.params.locale, undefined);
  // 数でないものは NaN —— paramsFor が断る材料になる。
  assert.ok(Number.isNaN(parseWaczRoute("/wacz/x/lines?path=p&from=abc&count=1")?.params.from));
  // 空の path は無いのと同じ。
  assert.equal(parseWaczRoute("/wacz/x/line?path=&n=1")?.params.path, undefined);
});

test("paramsFor: op ごとに要るものだけを組み、足りなければ BadRequest", () => {
  assert.deepEqual(paramsFor("validate", {}), { locale: "ja" });
  assert.deepEqual(paramsFor("lines", { path: "p", from: 0, count: 200 }), { path: "p", from: 0, count: 200 });
  assert.deepEqual(paramsFor("line", { path: "p", n: 66 }), { path: "p", n: 66 });
  assert.deepEqual(paramsFor("record/body", { path: "p", offset: 2176252, length: 10791 }), {
    path: "p",
    offset: 2176252,
    length: 10791,
  });
  assert.throws(() => paramsFor("lines", { path: "p", from: 0 }), BadRequest); // count が無い
  assert.throws(() => paramsFor("lines", { path: "p", from: NaN, count: 1 }), BadRequest); // 数でない
  assert.throws(() => paramsFor("record", { path: "p", offset: 1 }), BadRequest); // length が無い
  assert.throws(() => paramsFor("nope", {}), BadRequest);
});

test("paramsFor: 検証の報告の言語は画面が送った物。送らなければ日本語、知らない言語は断る", () => {
  assert.deepEqual(paramsFor("validate", { locale: "en" }), { locale: "en" });
  assert.deepEqual(paramsFor("validate", { locale: "ja" }), { locale: "ja" });
  // 黙って別の言語に倒さない
  assert.throws(() => paramsFor("validate", { locale: "fr" }), (err) => {
    assert.ok(err instanceof BadRequest);
    assert.equal(err.message, "unknown locale");
    assert.deepEqual(err.params, { locale: "fr" });
    return true;
  });
});

test("paramsFor: 断りは句と値で言う（文は画面の辞書が持つ）", () => {
  assert.throws(() => paramsFor("line", { path: "p" }), (err) => {
    assert.equal(err.message, "parameter required");
    assert.deepEqual(err.params, { name: "n" });
    return true;
  });
  assert.throws(() => paramsFor("nope", {}), (err) => {
    assert.equal(err.message, "unknown op");
    assert.deepEqual(err.params, { op: "nope" });
    return true;
  });
});

const SIGNED = "http://127.0.0.1:8333/b/k.wacz?X-Amz-Signature=SECRET-SIGNATURE&X-Amz-Expires=300";

test("viaSignedUrl: capture-ledger が断ったら daemon を呼ばない", async () => {
  let called = 0;
  const res = await viaSignedUrl(
    {
      toLedger: async () => ({ ok: false, status: 404 }),
      call: async () => {
        called++;
        return { ok: true };
      },
    },
    "id",
  );
  assert.equal(res.status, 404);
  assert.equal(called, 0);
});

test("viaSignedUrl: 署名をもらって daemon に渡し、答えをそのまま返す", async () => {
  const seen = [];
  const res = await viaSignedUrl(
    {
      toLedger: async (path, method) => {
        seen.push(`${method} ${path}`);
        return { ok: true, json: async () => ({ url: SIGNED }) };
      },
      call: async (href) => ({ ok: true, href }),
    },
    "a b",
  );
  assert.deepEqual(seen, ["POST /api/archives/a%20b/url"]);
  assert.equal(res.href, SIGNED); // daemon には署名つきのまま渡す（向こうは query を落として報告する）
});

test("viaSignedUrl: daemon 側が URL 入りの例外を投げても、文に署名が残らない", async () => {
  await assert.rejects(
    viaSignedUrl(
      {
        toLedger: async () => ({ ok: true, json: async () => ({ url: SIGNED }) }),
        call: async (href) => {
          throw new Error(`fetch failed for ${href}`);
        },
      },
      "id",
    ),
    (err) => {
      assert.ok(!err.message.includes("SECRET-SIGNATURE"), err.message);
      assert.ok(err.message.includes("(signed URL)"));
      return true;
    },
  );
});

test("viaSignedUrl: 句を持つ誤りは、値の中の署名だけを伏せて、句と値のまま返す", async () => {
  await assert.rejects(
    viaSignedUrl(
      {
        toLedger: async () => ({ ok: true, json: async () => ({ url: SIGNED }) }),
        call: async (href) => {
          throw new Told("validator unreachable", { url: "http://127.0.0.1:7180", cause: `fetch failed for ${href}` });
        },
      },
      "id",
    ),
    (err) => {
      assert.ok(err instanceof Told);
      assert.equal(err.message, "validator unreachable");
      assert.deepEqual(err.params, { url: "http://127.0.0.1:7180", cause: "fetch failed for (signed URL)" });
      return true;
    },
  );
});
