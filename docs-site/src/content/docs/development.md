---
title: Development
description: Where the dependencies stop, the bundles, the text on the screen and its dictionaries, what the checks and tests see and do not see, opening capture-workbench in the sandbox, editing these docs, re-taking the screenshots, releasing
---

## Where the dependencies stop

**capture-workbench (the repository root) has no npm dependencies.** It is one Node http server and
JavaScript that runs as-is in the browser. Nothing goes through a framework, so the workbench needs
no install, no lockfile and no audit (the same call as
[capture-scripts](https://github.com/uraitakahito/capture-scripts)). If it grows enough to want
splitting up, that is the time to add them. **The exceptions are the two bundles in
`public/vendor/`:** `shiki.js`, the coloring of the script collection view, and
`intl-messageformat.js`, which turns the messages of the dictionaries into text
([The text on the screen](#the-text-on-the-screen)). Each is bundled into a single file and
committed (see [The bundles](#the-bundles)). The workbench only reads them, so it still needs no
install.

Two things have dependencies, each kept as a separate npm project: `docs-site/` (the source of
this site, Astro + Starlight, and the tool that takes its screenshots) and `highlighter/` (what the bundles in `public/vendor/` are built from).
Their lockfiles, audits and Dependabot stay inside them, and no `node_modules` is created at the
root.

| Run | What it does |
| --- | --- |
| `npm run dev` | serves `public/`, relaying `/api/*` to the ledger and `/wacz/*` to the daemon |
| `npm run check` | every check for the workbench to run before pushing; what it runs, and in which order, is `check` in `package.json` (the same thing CI's `ci.yml` runs) |
| `npm run site:check` | builds the docs and checks that they match the repository (after `npm ci --prefix docs-site`) |
| `npm run vendor` | rebuilds `public/vendor/` (the bundles and the license texts of what they bundle) from the lockfile in `highlighter/` |
| `npm run vendor:check` | rebuilds, and fails if a single byte differs from what is committed (CI's `vendor.yml` runs it) |

The root scripts work the same with `pnpm run` (the `dev:up` of
[capture-ledger](https://github.com/uraitakahito/capture-ledger) starts the workbench with `pnpm run dev`). `site:check` is deliberately not part of `check`: that `check` runs without
installing anything is part of the workbench's nature too.

## The bundles

The script collection view colors the source with `public/vendor/shiki.js`:
[Shiki](https://shiki.style) with only the TypeScript grammar and two themes (GitHub Light High
Contrast and GitHub Dark Default), bundled by esbuild (`highlighter/entry.mjs` names what goes in).
The text on the screen is put together by `public/vendor/intl-messageformat.js`:
[intl-messageformat](https://formatjs.github.io/docs/intl-messageformat/) and the parser it
depends on (`highlighter/entry-i18n.mjs`). Which bundles are built, and from what, is the
`BUNDLES` table in `highlighter/build.mjs`.
The bundles are minified, so their diff cannot be reviewed by reading it. Review the lockfile and
`highlighter/build.mjs` instead, and let `vendor.yml` check that each bundle is exactly what they
produce.

- **Do not edit `public/vendor/` by hand.** `npm run vendor` writes it. Run it after raising
  the version of Shiki or of intl-messageformat.
- **A Dependabot PR for `highlighter/` only changes `package.json` and the lockfile,** so
  `vendor.yml` fails on it. Run `npm run vendor` on that branch and commit the rebuilt files
  before merging.
- **The build stops if anything it bundles has a license that was not allowed**
  (`highlighter/build.mjs`), and then writes nothing. MIT is allowed. Any other license is allowed
  only for a package named in `BUNDLES`: today that is intl-messageformat's BSD-3-Clause. The
  license texts of everything bundled are next to each bundle (`public/vendor/shiki.LICENSES.txt`,
  `public/vendor/intl-messageformat.LICENSES.txt`).
- **The colors are measured against the screen's backgrounds.** `test/highlight.test.mjs` reads
  `--ground` from `public/app.css` and requires every color the script files use to reach
  4.5:1 in both schemes, so changing the background or the theme measures again.
- **`npm run check` looks for the word `innerHTML` in every `.js` file under `public/`,** the bundles
  included. It does not read `.html` files, nor look for other APIs (`insertAdjacentHTML` and the like).
- **The coloring runs in a worker** (`public/highlight-worker.js`): Shiki builds its grammar on
  first use, which would stop the page for well over 100 ms. The colors are painted onto the
  lines already drawn, a few milliseconds per frame.

## The text on the screen

The words on the screen are not written where they are drawn. `public/*.js` and `public/index.html`
hold keys, and the sentences are in one dictionary per language, `public/i18n/ja.json` and
`public/i18n/en.json`. `public/i18n.js` turns a key into a sentence in the page's language.

- **A dictionary is a flat JSON of key → message, in ICU MessageFormat** (the same shape as
  [wacz-validator](https://github.com/uraitakahito/wacz-validator)'s dictionaries). `{name}` embeds
  a value, `{n, plural, one {{n} page} other {{n} pages}}` chooses between singular and plural in
  English, and `<code>…</code>` puts part of the sentence in an element. A brace that is meant as
  text is quoted with `'` (`'{'chrome'}'`). What turns a message into text is the bundled
  `public/vendor/intl-messageformat.js` ([The bundles](#the-bundles)).
- **A key is `<view>.<group>.<meaning>`.** The view is its name in the code (`crawls`, `start`,
  `schedules`, `changes`, `archives`, `search`, `scripts`, `wacz`, `links`, `trace`), `common` is
  for what every view shows, `workbench.error.<phrase>` is for the errors of the workbench's
  own server ([What failures look like](/routes/#what-failures-look-like)), and
  `ledger.error.<phrase>`, `ledger.hint.<key>` and `ledger.list.*` are for the ledger's refusals
  (below). **Write a key out as a
  string; never assemble one.** The check compares the keys the code names with the dictionaries,
  and it cannot see a key that is put together at run time. A table from a value to its words is
  written as a function that returns the words (`actionText` in `public/start.js`), not as a table
  of keys. Where a key does have to be written outside `t()` (a phrase that arrives as data and is
  looked up with `phraseText`), wrap it in `key("…")` so that the check counts it. The keys
  under `ledger.` are the one exception: `public/i18n.js` puts them together from the ledger's
  answer, so the code names none of them.
- **In JavaScript, `t("key", { values })`.** For a sentence with an element in it,
  `tNodes("key", { code: (text) => element })` returns strings and elements to hand to `append`.
  No API that takes HTML is used, for the dictionaries either. **In `public/index.html`, write no
  words:** `data-i18n="key"` fills an element, and `data-i18n-placeholder`, `data-i18n-aria-label`
  and `data-i18n-title` fill attributes, when the page loads.
- **One sentence, one key.** Do not build a sentence from pieces: the order of the pieces is
  different in the other language. Inside a plural, write `{n}` rather than `#`. `#` groups the
  digits in English (`1,234`) and the Japanese sentence would not.
- **The language is decided once, when the page loads** (`chooseLang` in `public/i18n.js`):
  `?lang=ja` or `?lang=en` in the URL (for that load only), then the choice the switch at the top
  right remembered (`localStorage`), then the first of the browser's languages that is Japanese or
  English, then English. Nothing is drawn again afterwards: the switch stores the choice, takes
  `?lang=` off the URL (it would win over the stored choice) and reloads the page.
- **Words that become stored data are sent as a fixed English phrase, not as a sentence.** The
  reason sent when a row left running is closed from the schedules view ends up in the crawl's
  `error`. Where it is shown, `phraseText` looks the phrase up (`crawls.reason.<phrase>`); a
  phrase that is not in the dictionary, such as one stored before or written by another system,
  is shown as it arrived.
- **What is not translated:** what was stored, or written by another system, and arrives as
  data: states such as `captured`, step names, log lines, and stored failure reasons (a crawl's
  `error`, the reason of a schedule's run, the reason a bundle could not be written; only the
  phrases the workbench itself sent are looked up, as above). Also proper names
  (ReplayWeb.page ↗, run ↗, WACZ, User-Agent), units (`ms`, `KiB`) and Claude's summaries, which
  the ledger has written in Japanese (the changes view says so in English). The validation
  report is not the workbench's to translate either: the daemon writes it in the language the
  page asks for ([WACZ](/wacz/)). What the ledger says when it refuses a request is translated
  (the ledger's refusals, below).
- **Dates follow the language, machine-like forms do not.** `dateTime()` writes `2026/1/5 4:00:00`
  in Japanese (the form the workbench has always shown) and `Jan 5, 2026, 4:00:00 AM` in English.
  Grouped digits (`1,234`), `11-08 04:00`, `2026-11-13` and `1m 40s` are the same in both.
- **An error from the server is a phrase and its values, not a sentence.** `errorText()` in
  `public/i18n.js` is the one place that decides what to show, in this order: a phrase of the
  workbench's server through the dictionary (`workbench.error.<phrase>`); a phrase of the ledger,
  when the dictionary has `ledger.error.<phrase>`; the answer's `message`; its `error`, as it
  arrived. A stock Fastify answer (a body the schema rejects, a route the ledger does not serve)
  has the name of the status in `error` (`Bad Request`) and what went wrong in `message`, so it
  is the `message` that is shown. That is why no status name may be a key under `ledger.error.`.
- **The ledger's refusals are translated with the dictionary.** The ledger refuses with a phrase
  in `error` and, from capture-ledger v0.102.0, its reasons in `hints`: a list of
  `{ key?, params?, text }`, next to the sentence it has always sent in `hint`.
  `ledger.error.<phrase>` is the sentence for a phrase. It embeds no values and ends without a
  full stop, because the caller appends what the ledger named (ids, names) and the reasons.
  `ledger.hint.<key>` is the sentence for one reason, filled from its `params` (`hintText`,
  `hintsText`), and `ledger.list.*` are the separators that join a list of values and several
  reasons. The reasons a fix was rejected (`refusalHints`) are read the same way
  (`refusalTexts`). What cannot be translated is shown as it arrived: a phrase or a key the
  dictionary does not have (a ledger newer than the workbench), a reason without a key (a command
  to run, a list of script ids), a reason whose values are missing, and the `hint` of an older
  ledger that sends no `hints`. **The Japanese `ledger.hint.*` is, character for character, the
  sentence the ledger writes,** so the Japanese screen reads the same whether or not the ledger
  sends `hints`.
- **When the ledger adds a phrase or a key,** add it here. A phrase goes into both dictionaries
  as `ledger.error.<phrase>`. A key goes into `HINT_KEYS` in `sandbox/fake-ledger.mjs` (the copy
  of the ledger's list of keys, with the names of the values each one embeds) and into both
  dictionaries as `ledger.hint.<key>`, the Japanese in the same characters as the ledger's
  sentence, together with a sample of the ledger's answer for it in `test/ledger-text.test.mjs`.
  That test fails when the copy and the dictionaries differ in either direction, when a sentence
  embeds other values than the copy lists, and when the Japanese built from a sample is not the
  ledger's sentence. Nothing lists the ledger's phrases, so a phrase that is missing from the
  dictionaries is not caught: it shows in English, as it arrived.

`npm run check:i18n` (part of `npm run check`) keeps it that way. It fails when:

1. a key is in one dictionary and not in the other;
2. the embedded names of a key differ between the languages (`{n}` against `{m}`), or a message
   cannot be parsed;
3. the code or `public/index.html` names a key that is in no dictionary, a key in the dictionaries
   is used nowhere, or the first argument of `t()`, `tNodes()` or `key()` is not a string. The keys
   under `workbench.error.` are compared with `ERROR_PHRASES` in `src/lib.mjs`, in both directions.
   The keys under `ledger.` come from the ledger's answers, so they are left out of "used
   nowhere" (`test/ledger-text.test.mjs` compares `ledger.hint.*` with the copy of the ledger's keys);
4. there is Japanese text outside comments in `public/*.js` or `public/index.html` (full-width
   punctuation included). One line is enough.

The tests run in Japanese whatever the machine's language is: `npm test` loads
`test/lang-ja.mjs` first. A test of the English text calls `setLang("en")` and sets it back to
`"ja"` when it is done; in the browser nothing calls `setLang`.

### The words chosen

The English of the dictionary starts from the English these docs already used. Where the docs
had used two words for one thing, the dictionary takes one.

| Key or group | Japanese | English | Note |
| --- | --- | --- | --- |
| `common.tab.*` | クロール・新しいクロール・定期実行・変化・アーカイブ・検索・スクリプト集 | Crawls, New crawl, Schedules, Changes, Archives, Search, Script collection | sentence case, as every heading and button |
| `crawls.state.running` | 走行中 | Running | |
| `crawls.state.completed` | 完走 | Completed | the ledger's `stopReason` is `completed`; "finished" is any row that has ended |
| `crawls.state.maxDepth` | 打ち切り (深さ) | Cut (depth) | `crawls.state.maxPages` is Cut (pages) |
| `crawls.state.withFailed` | ・2 枚取れず | · 2 pages failed | the ledger's field is `pagesFailed` |
| `crawls.state.pageOnly` | このページだけ | This page only | |
| `archives.check.*` | 問題なし・失敗 1・警告 3・検証できず | No problems, 1 failure, 3 warnings, Could not validate | a crawl is Failed; a validation has failures |
| `start.tab.inline` | その場の TS | Your script | "inline" is kept for the id (`inline-<name>`) and the API |
| `start.schedule.make` | 定期にする | Make a schedule | |
| `common.col.goto` | 行き先 | Open in | "Links" is the リンク column |
| a level and a step | 段 | level (one round of a crawl), step (of a capture or of compile) | |
| a row and a line | 行 | row (tables and rules), line (source, logs, diffs) | |
| a run | 回 | run (of a schedule), times (how often) | |
| the seed | 起点 | seed | |
| the snapshot | 写し | snapshot | Copy is the 写す button |
| `wacz.type.frameSnapshot` | 枠の写し | frame snapshot | the specification's Japanese says フレームの写し |

## What the tests see, and what they do not

The tests (`test/`, `node --test`) only cover the parts that do not talk to the outside: parsing
routes, rewriting arguments, keeping the signature from leaking, how states and numbers are
worded, and so on. Those parts are split out into files such as `src/wacz.mjs` and
`public/format.js` so that the tests can call them directly. The ones under `public/` are the
same files the browser reads, so there is no copy to rot.

**Relaying and signing in on the real IdP are not checked in CI.** The steps of signing in (the
`state`, PKCE, the session) are tested against a fake IdP (`test/auth.test.mjs`), but the round trip
cannot be confirmed without the ledger and Floci running, so the evidence is gathered by hand and
pasted into the PR.

## Opening the workbench in the sandbox

A way to open the workbench in every state without starting the ledger's stack. The other side (a
stand-in for the ledger, and the real validation daemon) runs in containers, and the workbench runs
on the host.

1. Put [wacz-validator](https://github.com/uraitakahito/wacz-validator) next to this repository
   (`../wacz-validator`). The daemon's image is built from the daemon stage of its Dockerfile.
2. Bring it up and open it.

   ```sh
   npm run sandbox       # the first time, builds the daemon's image before starting
   open http://127.0.0.1:7081/
   ```

3. Clean up. Ctrl-C stops the workbench, and `npm run sandbox:down` stops the containers.

Its ports are moved away from the ones `dev:up` uses, so both can run side by side (the ports are
in `sandbox/sandbox.env`). The workbench reads only `sandbox/sandbox.env`, never your `.env`. How the
containers fit together is written at the top of `docker-compose.yml`.

What it shows is decided by the scenario (`sandbox/scenario.json`) and the sample WACZ files (the
archive files [Web Capture](https://uraitakahito.github.io/capture-ledger/#web-capture) produces, in `sandbox/samples/`). Five of the samples are copied from a corpus
whose validation results are known, and the rest are BrowserHive captures, there for the trace view (`trace-timeline.wacz`, and the stage-screenshot samples `with-screenshots.wacz` and `without-screenshots-*.wacz`); where they come from, and the result each corpus sample should get, is
in `sandbox/samples/SOURCE.md`.

| To | Do |
| --- | --- |
| change what it shows | edit the scenario. The stand-in reads it on every request, so the change reaches the screen without restarting anything |
| see a ledger with no scripts | set `"emptyCatalog"` to `true` in the scenario. The script collection view then lists only the receptacle types |
| change the scripts | edit the scenario's `catalog`: one entry per version, with the order the ids first appear in as the default run order, naming a file under `sandbox/catalog/` (copies of capture-scripts v0.13.1's scripts and receptacle types, with `egov-law-search` from `generated/`). The stand-in computes `sha256` and `bytes` from the file, as the ledger does, and its list has one row per id: the newest enabled version, or else the newest version with `enabled: false`. autoscroll v2 is the same file with different `options`. autofetch is `enabled: false`, as a ledger keeps a script whose catalog entry says `"default": false`: it runs only when named. A version with `sites` is a site script and runs by default only when a seed is on one of those hosts; `egov-law-search` (sites `laws.e-gov.go.jp`) is a capture-scripts copy too, the same version as a real ledger's. A version's `params` are its declarations (the `params` of capture-scripts' `catalog.json`), carried by the list and the single-version route; `egov-law-search` declares the variable `query`. `hostTypes` is the receptacle types; remove it to see a ledger that has not imported them. The copies are left out of `check:terms`: they are another repository's words, and editing them would shift their line numbers |
| list other WACZ files | `SANDBOX_WACZ_DIR=<dir> npm run sandbox` (relative to this repository, for example `../wacz-validator/samples`). The stand-in and the daemon both get the same directory |
| put an updated wacz-validator into the daemon | `npm run sandbox:build`. `npm run sandbox` only builds the image when there is none |
| try the new crawl view | Start a crawl from the new crawl view. The stand-in runs each crawl it accepts for the scenario's `submit.runsSeconds` seconds, then completes it. Pressing again while it runs gives a 409; a URL that cannot be read gives a 400. It takes `scripts` (ticked registered scripts and a script of your own) the way the ledger does, answers an unknown script id, the same id twice, a misspelt name, a site script that fits no seed, or an empty default (no scripts at all, or nothing that fits the seeds) with the ledger's 400, refuses a key the ledger's schema does not have with the ledger's wording (`body must NOT have additional properties`), and lists what ran when you open the row. 読む (read) next to a checkbox opens the script in the right column (the stand-in's autoscroll is v2, with options; egov-law-search cannot be ticked without a laws.e-gov.go.jp seed, but can be read) |
| try per-crawl values | Seed `https://laws.e-gov.go.jp/` and tick egov-law-search: the field for the required variable `query` appears. Its value is sent as `variables` and shows under 渡した値 (values passed) when you open the row. Writing `defineParams` in your own script makes a field appear too: the stand-in answers `POST /api/scripts/check` by reading the source with a regular expression (only the stand-in takes this shortcut; the real reader walks the syntax tree in ts-compile-service, and the stand-in's `diagnostics` are limited to `BH0002` and `BH0004`, because it does not type-check). The stand-in answers in the ledger's order (from v0.90.0) and wording (as of v0.107.0): a required variable missing (`missing variables`, before any other check on the values), one name declared with two kinds or two shapes, or as both kept in and hidden from the WARC (`conflicting params`), a secret's name passed as a variable (`secrets cannot be passed as variables`), a variable no script declared (`unknown variables`), a value that does not fit its declaration (`invalid variables`, with the reasons in `hint`), a required secret missing from Windmill (`unknown secrets`, with name, path and a `hint`), a variable there that is not a secret (`not a secret variable`), and a hidden secret sent while the deployment's formats cannot have its value replaced (`formats that cannot hide secrets`, with the names and a `hint`). Beside each `hint` the stand-in sends `hints` in the ledger's shape (the keys are the copy `HINT_KEYS` in `sandbox/fake-ledger.mjs`), so the English screen shows these reasons in English. The scenario's `captureFormats` stands in for the deployment's formats (by default `["wacz"]`, as in the ledger; add `"png"` or the like to see that 400). The shape of a script of your own's declarations gets the ledger's schema wording; `inline.params` takes secrets only (with `"archive": "keep"` to keep a value in the WARC), and a variable there or a name declared twice gets `invalid params`. The scenario's `windmillSecrets` (names of existing secret variables) and `windmillVariables` (names that exist but are not secret) stand in for Windmill. Declaring a secret can only be tried by sending `inline.params` of a script of your own straight to the ledger's API (the view has no field for it). Crawl `5b0c0007` in the scenario carries the variable `query`, the hidden secret `api_token` and the kept secret `login` (`archive: "keep"`), so its opened row shows 渡した値 and 使ったシークレット with whether the WARC hides or keeps each. The stand-in, like the ledger, writes a secret's value nowhere |
| try the User-Agent box | Press Headless を外す型を入れる in the new crawl view, or type your own text. The stand-in refuses the wrong form of the text with the ledger's wording and shows the text in the opened row |
| try the rules | Choose リンクを辿る in the new crawl view. The stand-in checks the rules the way the ledger v0.62.0 does — the same three 400s with the same wording, the same answer from `/api/crawl-rules/check` — and answers `/api/crawls/:id/decisions`. Crawl `5b0c0007` in the scenario carries `rules`, `decisions` and `robots`, with one rule that never matched. **`same-site` is approximated**: the stand-in has no Public Suffix List and takes the last two labels of the host name as the site, so it reads `example.co.jp` and `other.co.jp` as one site (the ledger, with tldts, does not) |
| see pages and logs | Give a crawl in the scenario `pages`: page rows, each with a `log` in the shape of BrowserHive's answer (`counts` may be left out; it is then counted from the lines). The stand-in answers the ledger's `/api/crawls/:id/pages` (`after` and `limit`; the body's `next` says where it continues) and `/api/crawls/:id/pages/:page/log`, and gives each entry of `failures` a `page`. An `after` that is not all digits, or a `limit` out of range, gets a 400. For a page without `log`, it answers why the log cannot be read (the scenario's `logReason`; otherwise `not-captured` for a page without a taskId, `no-log` for one with). Crawl `5b0c0009` in the scenario has a page that timed out (with warn and error lines), a page with dropped and cut-short lines, and a page robots.txt kept the crawl from taking. A crawl without `pages` lists none. To see 続きを読む (read on), give a crawl more pages than one batch of the ledger (the stand-in's batch is the ledger's default, in `pageList` in `sandbox/fake-ledger.mjs`) |
| see a capture's trace | Open the scenario's crawl `5b0c000b` and press 経緯 in its pages table. Page 1301 points at the sample `trace-timeline.wacz`, and its `capture` fields, log and request lines (`trace`) are the real answer of the capture that made that WACZ (BrowserHive v30.0.0) — the bars and the wait come from the log and the answer, the request bars from the `trace` lines (the WARC records are not read). Page 1302 timed out, has no WACZ, and shows the step it stopped in and the bar of the request that did not finish. Page 1303 is the same capture as 1301 in the shape of an answer without `trace`, so its request marks come from the WARC records the real daemon reads (how a capture by BrowserHive before v30.0.0 is read). The stand-in answers the ledger's `/api/crawls/:id/pages/:page/trace` from the page's `capture`, `log`, `trace`, `submittedAt` and `finishedAt` in the scenario. A page without `capture` gets the reason its trace cannot be read (the scenario's `traceReason`; left out, `not-captured` for a page with no taskId, otherwise `no-manifest`). `trace` is passed through as written when the scenario's page has one, and is null otherwise (as in ledger v0.101.0) |
| see stage screenshots and the screenshot at a failure | Press 経緯 on pages 1304 to 1307 of the same crawl `5b0c000b`. Page 1304 points at the sample `with-screenshots.wacz` and shows two pictures (their places come from the WACZ's index as the real daemon reads it, the pictures from the records inside the WACZ). Pages 1305 and 1306 are captures that kept no screenshot, and show the reason (`withheld`, `secret`) in one line (the WACZ is not read for screenshots). For these three pages, what happened to the screenshots (`capture.screenshots`), the log and the `trace` lines are as they are inside the sample WACZ files (BrowserHive v30.2.0 captures). Page 1307 is a capture whose document answered 503, and shows the screenshot at the failure: the stand-in gives `capture.failureScreenshot` in the trace answer as a boolean (true when the page names a picture file with `failureScreenshot`), and answers the ledger's `/api/crawls/:id/pages/:page/trace/failure-screenshot` with `{ contentType, base64 }`. **Page 1307's answer is not from a real capture** (it is put together in the shape of BrowserHive's answer; where the picture comes from is in `sandbox/samples/SOURCE.md`). To see the other reasons (`disabled`, `task-budget`, `failed`), edit `skipped` in a page's `capture.screenshots` |
| see the picture as captured (Look, 見た目) | Open the archives view. The stand-in lists archives newest capture first, like the ledger, so the four BrowserHive samples come first (withheld response, secret, picture, no record): the scenario's `archives` gives them the `capturedAt` and `screenshot` of the pages that point at the same WACZ. In the pages table, page 1201 of crawl `5b0c0009` shows the picture and 1203 the box for a withheld response, and pages 1301 to 1306 of `5b0c000b` show the picture or the box of their WACZ. A row's `screenshot` is what the scenario writes on the archive or the page (left out, it is null: no record). The stand-in answers the ledger's `GET /api/archives/:id/screenshots/:stage` with the WebP that the scenario's `stageScreenshots` names, with the same headers as the ledger (a 404 when it names none). The picture is the body of the `after-load` record in `with-screenshots.wacz`, as it is (`sandbox/screenshots/`; where it comes from is in `sandbox/samples/SOURCE.md`). To see the other boxes, change a `screenshot` to `{ "stage": "after-load", "skipped": "disabled" }` or `{ "stage": "after-load", "problem": "no-index-line" }` |
| see rows with scripts | Give a crawl in the scenario a `scripts` list (a script written on the spot carries `inline`). The bundled scenario has a crawl that ran one and completed, and one that failed at the compile step. Like the ledger, the stand-in leaves the source out of a crawl's detail, and "put back in the form" fetches it from the route by name (`/api/crawls/:id/inline/:name`). The `sha256` of crawl `5b0c0008`'s autoscroll differs from the ledger's v1 on purpose, to show the warning a crawl's "read" link gives when a version number has been reused |
| try the search view | Type words in the search view (the bundled scenario gives two hits for ランプ). The stand-in answers from the scenario's `searchPages` (each archive's page-list lines; a line without `stage` is the document's) by the ledger's rule: for an archive with snapshot lines only the snapshots are searched, and `hidden` archives are left out. **The stand-in has no OpenSearch**: it picks the lines whose title or text contains the words, with no scoring or word splitting. A missing or empty `q`, or any other parameter, is a 400 with the ledger's schema message |
| see a crawl's bundle | Open crawl `5b0c0009` in the scenario: its row has ReplayWeb.page ↗ / Web Capture ↗ next to run ↗, and in its pages table the captured pages have ReplayWeb.page ↗ / Web Capture ↗ after their outcome (the crawl's `replayBundle` is at r2, and the pages' `bundledRev` are 1 and 2); the page that timed out and the one robots.txt kept out have none. `5b0c0003` could not write the version after r2 (its row still opens r2, and the opened row says why), and `5b0c0002` never wrote one (no ReplayWeb.page ↗ / Web Capture ↗; the opened row says why). Give a crawl in the scenario `replayBundle` (`rev`, `pages`, `builtAt` and `error`; leave out `rev` for a crawl whose bundle only failed) and its pages `capturedAt` and `bundledRev`. The stand-in builds the key the way the ledger does (`org/<orgId>/crawls/<crawlId>/r<rev>/replay.json`). **The stand-in writes no bundle**: ReplayWeb.page ↗ / Web Capture ↗ leads to nothing |
| ask for a fix | Open crawl `5b0c0008` (failed the type check). The stand-in answers `/api/crawls/:id/diagnostics` from the crawl's `diagnosed` in the scenario (the ledger's answer as it is; a crawl without it type-checks), and `POST /api/crawls/:id/inline/:name/fix` from its `fixes` (`{ status, body }` per inline script's name). **The stand-in never calls Claude**: a name not in `fixes` is a 404. `5b0c0008` carries one TS7006 and a fix that passed the check (lines 2–3; the fixed source type-checks under TypeScript 6.0.3 strict). To see another answer, give `fixes` a `status` such as 429 or 422 with the ledger's body |
| schedules | The 定期実行 tab: a schedule whose runs failed (with the band on every view), one queued, one paused. Actions are remembered while the stand-in runs; there is no tick, so run now only sets the request. |
| changes | The 変化 tab: the script's `changes` (`runs` for the list, `details` per crawl id) answered in capture-ledger's shape. The latest run of 毎時の確認 links to it through its `change`. **The stand-in neither compares nor summarizes.** |

There are things the stand-in does not do:

- **It does not imitate authorization.** Any identity gets through, so the screens for a missing
  permission do not appear here.
- **It does not imitate the IdP's sign-in.** The stand-in also plays the IdP
  (`http://127.0.0.1:17070/sandbox-pool`, set in `sandbox/sandbox.env`): its sign-in sends you
  straight back without a page, and its token is an unsigned sample for the user `sandbox` in the
  group `acme`.
- **ReplayWeb.page ↗ / Web Capture ↗ and run ↗ lead outside the sandbox.** The stand-in's rows, and their bundles, do not
  exist over there.
- The validation report says `wacz-validator unknown` (the image is built without `.git`).
- The red messages on the screen name capture-ledger commands as the fix. In the sandbox, read
  "the ledger" as the stand-in and "the daemon" as the `sandbox-validator` container.
- The shape of the stand-in's answers is copied from the ledger's code. When the ledger changes a
  field, the stand-in does not follow (`test/sandbox.test.mjs` pins the copied set of fields).
  Checking against the real thing happens on the `dev:up` stack.

Reading it with headless Chrome's `--dump-dom` never finishes, because the workbench keeps fetching
its lists (the DOM is there by the time you stop it). To press buttons automatically, use a tool
that drives the page, such as puppeteer.

## Editing these docs

```sh
npm ci --prefix docs-site   # once
npm run site:dev            # see it as you edit
npm run site:check          # before pushing
```

- **`astro build` alone protects nothing.** In a `.md` page, whatever fails while rendering is
  swallowed by Starlight, and the build exits with 0. That is why `site:check` runs the build
  together with `scripts/check-doc-refs.mjs`, and CI (`site.yml`) runs the same thing. What it
  checks is written at the top of that file.
- **Look at diagrams (mermaid) in a browser.** They are drawn in the browser, so a syntax error
  still builds. After changing a diagram, open it with `npm run site:dev` and make sure it is
  drawn and no "Syntax error" appears. To look at the built site, run
  `npm run site:build && npm run site:preview`. The preview moves itself to the background and
  keeps serving `http://localhost:4321/capture-workbench/`, so stop it with
  `cd docs-site && npx astro preview stop` when you are done.
- **Change English and Japanese in the same PR.** The pairing check only compares file names, not
  contents. It does not need to be a literal translation: write the same facts in each language's
  own words.
- **Write links in the body as `[x](/page/)`.** The base (`/capture-workbench`) and `/ja` are added by
  `docs-site/src/plugins/hast-rebase-links.ts`. Links in the frontmatter do not go through it, so
  write those as `/capture-workbench/…`.
- **In Japanese, break lines after punctuation.** A line break in the middle of a sentence shows
  up as a space between characters.
- **In the Japanese pages, 名乗り means only who you look as.** What the IdP returns is an access
  token (アクセストークン). The forms that mixed the two up are watched by
  `scripts/check-terms.mjs`, which `npm run check` runs.

## Re-taking the screenshots

The pictures on the [Screens](/screens/) page are taken by `npm run docs:shots`
(`docs-site/scripts/docs-shots.mjs`) against the [sandbox](#opening-the-workbench-in-the-sandbox). No
picture is taken by hand. CI does not take them (that needs the stand-in's containers): they are
taken locally, and CI watches what was taken.

```sh
npm ci --prefix docs-site            # once (the tool is a docs-site dependency)
npm run sandbox                      # in another terminal; wait until 7081 answers
npm run docs:shots                   # all of them; a picture whose pixels did not change is not written
npm run docs:shots -- start crawls   # only the named ones
```

- **After changing the workbench, re-take the pictures before opening the PR.** Changing the workbench
  (`public/`, the bundled coloring in `public/vendor/` included), the stand-in (`sandbox/`) or the
  tool makes `site:check` fail with 絵の元が、撮ったときと違う (the sources of the pictures differ from when the
  pictures were taken). Re-taking all of them sets the stamp in `shots.json` (`source`) to the
  sha256 of the current contents, and writes only the pictures whose pixels changed; a fix that
  changes nothing visible changes only the stamp. Do not copy the stamp by hand to turn it green:
  the pictures would stay stale.
- **Taking named pictures leaves the stamp alone.** Only a run that takes all of them brings it up
  to date.
- **The pictures are lossless WebP, within a budget for each picture and for all of them together**
  (`BUDGET` in `scripts/check-doc-refs.mjs`), because every re-take piles up in git. Going over makes
  `site:check` fail; then make the cropped box smaller, or lower its height limit (`maxHeight`), in
  `SHOTS` in `docs-shots.mjs`.
- **A picture meant to be read fits the docs' column.** The docs show a picture at its pixel size,
  and one wider than the column shrinks (at a 1280 window, a 960px picture shrank to 0.66 and its
  text could not be read). So every picture is taken in the same window (`WINDOW` in
  `docs-shots.mjs`) at a DPR (devicePixelRatio) of 1, and cropped to the column's width (`COLUMN`
  in `scripts/shots-source.mjs`, the column at a 1280 window). Only a table shown shrunk in the
  column (`wide: true` in `SHOTS`) may be wider. `site:check` reads the width from the picture
  itself and fails on one that is too wide.
- **The tool stops rather than take a picture it should not.** Before taking one, it checks three
  things: the width (within `COLUMN` unless wide), the crop's edges (no visible text crosses them),
  and the number marks (inside the crop, on top of no text). Text the workbench hides itself (long
  lines in the reading pane, an ellipsis) does not count as cut. When it stops, fix how `SHOTS`
  crops (`maxWidth`, `maxHeight`, `snap`) or where a mark goes, or shorten the text in the
  stand-in's scenario (`sandbox/scenario.json`). Text spilling out of its own box is a bug in the
  workbench.
- **Chrome's version is pinned** (`CHROME_BUILD` in `docs-shots.mjs`). If it is missing, the tool
  first installs it into `~/.cache/puppeteer`. Glyphs also depend on the OS's fonts, so the
  pictures are taken on macOS.
- **To add a picture, add one entry to `SHOTS`, take it, and put it on both screens pages (ja and
  en).** `site:check` fails on a file in the folder that `shots.json` does not list, and on a
  picture in `shots.json` that either screens page leaves out. The number marks are drawn inside
  the picture, carry only digits and start from 1 in each picture, so both languages use the same
  picture, and each says in its own words what the marks point at.

## Releasing and publishing

1. Make changes on a branch, open a PR against main and squash-merge it.
2. Put an annotated tag on the merged main commit by hand (`vX.Y.Z — summary`). The tag is the
   only version; `version` in `package.json` is not one.
3. Pushing the tag makes `docs.yml` publish the docs to GitHub Pages.

Merging into main does not change Pages. The docs that are published are the docs of a released
version (the github-pages environment also only accepts deployments from `v*` tags). To publish
again, point at the tag: `gh workflow run docs.yml --ref vX.Y.Z`.

Dependabot updates docs-site's dependencies once a week, grouped into one PR. `audit.yml` checks
its lockfile for known vulnerabilities every day.
