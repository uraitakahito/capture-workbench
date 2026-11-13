// public/vendor/ の束（shiki.js・intl-messageformat.js）と、束ねた package の license の一覧を作り直す。
// **手で直さない** —— vendor.yml が lockfile から作り直して、1 バイトでも違えば赤にする。
import { build } from "esbuild";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const here = (path) => new URL(path, import.meta.url).pathname;
const meta = (name) => JSON.parse(readFileSync(here(`node_modules/${name}/package.json`), "utf8"));
const licenseText = (name) => {
  // 並べてから選ぶ —— readdir の順は file system ごとに違い、CI（Linux）と手元（macOS）で一覧がずれうる
  const file = readdirSync(here(`node_modules/${name}`))
    .sort()
    .find((f) => /^licen[cs]e/i.test(f));
  if (file === undefined) throw new Error(`${name} に LICENSE が無い`);
  return readFileSync(here(`node_modules/${name}/${file}`), "utf8").trim();
};

/**
 * 作る束。1 行が 1 つの束で、`public/vendor/<out>.js` と `public/vendor/<out>.LICENSES.txt` になる。
 *
 *   - `entry`: 束ねる入口（このフォルダのファイル）
 *   - `lead`: 見出しに版を書く package
 *   - `allow`: MIT のほかに、**名指しで**同梱を許す package と license。同梱してよいかは人が決める ——
 *     ここに無い組み合わせが混ざったら止まる。`intl-messageformat` の BSD-3-Clause は、文言の辞書を
 *     ICU MessageFormat で読むために許した（Jira CAPTURE-294）
 */
const BUNDLES = [
  { out: "shiki", entry: "entry.mjs", lead: "shiki", allow: {} },
  {
    out: "intl-messageformat",
    entry: "entry-i18n.mjs",
    lead: "intl-messageformat",
    allow: { "intl-messageformat": "BSD-3-Clause" },
  },
];

// 書くのは全部の束を確かめ終えてから（write: false）—— 止まったときに、片方の束だけ新しくならないように
const writes = [];
for (const { out, entry, lead, allow } of BUNDLES) {
  // 束ねた package を名前の順に。**許していない license が混ざったら止める**
  const { metafile } = await build({
    entryPoints: [here(entry)],
    bundle: true,
    format: "esm",
    platform: "browser",
    metafile: true,
    write: false,
    logLevel: "warning",
  });
  const names = [
    ...new Set(Object.keys(metafile.inputs).flatMap((f) => f.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? [])),
  ].sort();
  const sections = names.map((name) => {
    const { version, license } = meta(name);
    if (license !== "MIT" && allow[name] !== license) {
      throw new Error(`${name}@${version} の license は ${license}。同梱してよいか確かめてから`);
    }
    return `${name}@${version} (${license})\n\n${licenseText(name)}`;
  });
  const licenses = [...new Set(names.map((name) => meta(name).license))].sort().join("・");
  const { outputFiles } = await build({
    entryPoints: [here(entry)],
    bundle: true,
    format: "esm",
    platform: "browser",
    minify: true,
    legalComments: "none",
    write: false,
    banner: {
      js: `/*! ${lead} ${meta(lead).version} ほか（${licenses}）。束ねた package と license の本文は ${out}.LICENSES.txt */`,
    },
    outfile: here(`../public/vendor/${out}.js`),
    logLevel: "warning",
  });
  for (const { path, contents } of outputFiles) writes.push([path, contents]);
  writes.push([here(`../public/vendor/${out}.LICENSES.txt`), `${sections.join(`\n\n${"-".repeat(72)}\n\n`)}\n`]);
}
for (const [path, contents] of writes) writeFileSync(path, contents);
