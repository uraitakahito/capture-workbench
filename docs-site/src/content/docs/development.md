---
title: Development
description: Where the dependencies stop, what the checks and tests see and do not see, opening the dashboard in the sandbox, editing these docs, re-taking the screenshots, releasing
---

## Where the dependencies stop

**The dashboard (the repository root) has no npm dependencies.** It is one Node http server and
JavaScript that runs as-is in the browser. Nothing goes through a framework, so the dashboard needs
no install, no lockfile and no audit (the same call as
[capture-scripts](https://github.com/uraitakahito/capture-scripts)). If it grows enough to want
splitting up, that is the time to add them. **The one exception is `public/vendor/shiki.js`,** the
coloring of the script collection view, bundled into a single file and committed (see
[The bundled coloring](#the-bundled-coloring)). The dashboard only reads it, so it still needs no
install.

Two things have dependencies, each kept as a separate npm project: `docs-site/` (the source of
this site, Astro + Starlight, and the tool that takes its screenshots) and `highlighter/` (what `public/vendor/shiki.js` is built from).
Their lockfiles, audits and Dependabot stay inside them, and no `node_modules` is created at the
root.

| Run | What it does |
| --- | --- |
| `npm run dev` | serves `public/`, relaying `/api/*` to the ledger and `/wacz/*` to the daemon |
| `npm run check` | every check for the dashboard to run before pushing; what it runs, and in which order, is `check` in `package.json` (the same thing CI's `ci.yml` runs) |
| `npm run site:check` | builds the docs and checks that they match the repository (after `npm ci --prefix docs-site`) |
| `npm run vendor` | rebuilds `public/vendor/` (the bundle and the license texts of what it bundles) from the lockfile in `highlighter/` |
| `npm run vendor:check` | rebuilds, and fails if a single byte differs from what is committed (CI's `vendor.yml` runs it) |

The root scripts work the same with `pnpm run` (the `dev:up` of
[capture-ledger](https://github.com/uraitakahito/capture-ledger) starts the dashboard with `pnpm run dev`). `site:check` is deliberately not part of `check`: that `check` runs without
installing anything is part of the dashboard's nature too.

## The bundled coloring

The script collection view colors the source with `public/vendor/shiki.js`:
[Shiki](https://shiki.style) with only the TypeScript grammar and two themes (GitHub Light High
Contrast and GitHub Dark Default), bundled by esbuild (`highlighter/entry.mjs` names what goes in).
The bundle is minified, so its diff cannot be reviewed by reading it. Review the lockfile and
`highlighter/build.mjs` instead, and let `vendor.yml` check that the bundle is exactly what they
produce.

- **Do not edit `public/vendor/` by hand.** `npm run vendor` writes it. Run it after raising
  Shiki's version.
- **A Dependabot PR for `highlighter/` only changes `package.json` and the lockfile,** so
  `vendor.yml` fails on it. Run `npm run vendor` on that branch and commit the rebuilt files
  before merging.
- **The build stops if anything it bundles is not MIT** (`highlighter/build.mjs`), and then writes
  nothing. The license texts of everything bundled are in `public/vendor/shiki.LICENSES.txt`.
- **The colors are measured against the screen's backgrounds.** `test/highlight.test.mjs` reads
  `--ground` from `public/app.css` and requires every color the script files use to reach
  4.5:1 in both schemes, so changing the background or the theme measures again.
- **`npm run check` looks for the word `innerHTML` in every `.js` file under `public/`,** the bundle
  included. It does not read `.html` files, nor look for other APIs (`insertAdjacentHTML` and the like).
- **The coloring runs in a worker** (`public/highlight-worker.js`): Shiki builds its grammar on
  first use, which would stop the page for well over 100 ms. The colors are painted onto the
  lines already drawn, a few milliseconds per frame.

## What the tests see, and what they do not

The tests (`test/`, `node --test`) only cover the parts that do not talk to the outside: parsing
routes, rewriting arguments, keeping the signature from leaking, how states and numbers are
worded, and so on. Those parts are split out into files such as `src/wacz.mjs` and
`public/format.js` so that the tests can call them directly. The ones under `public/` are the
same files the browser reads, so there is no copy to rot.

**Relaying and identity are not checked in CI.** They cannot be confirmed without the ledger and
the issuer running, so the evidence is gathered by hand and pasted into the PR.

## Opening the dashboard in the sandbox

A way to open the dashboard in every state without starting the ledger's stack. The other side (a
stand-in for the ledger, and the real validation daemon) runs in containers, and the dashboard runs
on the host.

1. Put [wacz-validator](https://github.com/uraitakahito/wacz-validator) next to this repository
   (`../wacz-validator`). The daemon's image is built from the daemon stage of its Dockerfile.
2. Bring it up and open it.

   ```sh
   npm run sandbox       # the first time, builds the daemon's image before starting
   open http://127.0.0.1:7081/
   ```

3. Clean up. Ctrl-C stops the dashboard, and `npm run sandbox:down` stops the containers.

Its ports are moved away from the ones `dev:up` uses, so both can run side by side (the ports are
in `sandbox/sandbox.env`). The dashboard reads only `sandbox/sandbox.env`, never your `.env`. How the
containers fit together is written at the top of `docker-compose.yml`.

What it shows is decided by the scenario (`sandbox/scenario.json`) and the sample WACZ files (the
archive files the crawler produces, in `sandbox/samples/`). The samples are copied from a corpus
whose validation results are known; where they come from, and the result each one should get, is
in `sandbox/samples/SOURCE.md`.

| To | Do |
| --- | --- |
| change what it shows | edit the scenario. The stand-in reads it on every request, so the change reaches the screen without restarting anything |
| see a ledger with no scripts | set `"emptyCatalog"` to `true` in the scenario. The script collection view then lists only the receptacle types |
| change the scripts | edit the scenario's `catalog`: one entry per version, with the order the ids first appear in as the default run order, naming a file under `sandbox/catalog/` (copies of capture-scripts v0.11.0's scripts and receptacle types). The stand-in computes `sha256` and `bytes` from the file, as the ledger does, and its list has one row per id: the newest enabled version, or else the newest version with `enabled: false`. autoscroll v2 is the same file with different `options`. autofetch is `enabled: false`, as a ledger keeps a script whose catalog entry says `"default": false`: it runs only when named. A version with `sites` is a site script and runs by default only when a seed is on one of those hosts; `egov-law-search` (sites `laws.e-gov.go.jp`) is a capture-scripts copy too, the same version as a real ledger's. A version's `params` are its declarations (the `params` of capture-scripts' `catalog.json`), carried by the list and the single-version route; `egov-law-search` declares the variable `query`. `hostTypes` is the receptacle types; remove it to see a ledger that has not imported them. The copies are left out of `check:terms`: they are another repository's words, and editing them would shift their line numbers |
| list other WACZ files | `SANDBOX_WACZ_DIR=<dir> npm run sandbox` (relative to this repository, for example `../wacz-validator/samples`). The stand-in and the daemon both get the same directory |
| put an updated wacz-validator into the daemon | `npm run sandbox:build`. `npm run sandbox` only builds the image when there is none |
| try the new crawl view | Start a crawl from the new crawl view. The stand-in runs each crawl it accepts for the scenario's `submit.runsSeconds` seconds, then completes it. Pressing again while it runs gives a 409; a URL that cannot be read gives a 400. It takes `scripts` (ticked registered scripts and a script of your own) the way the ledger does, answers an unknown script id, the same id twice, a misspelt name, a site script that fits no seed, or an empty default (no scripts at all, or nothing that fits the seeds) with the ledger's 400, refuses a key the ledger's schema does not have with the ledger's wording (`body must NOT have additional properties`), and lists what ran when you open the row. 読む (read) next to a checkbox opens the script in the right column (the stand-in's autoscroll is v2, with options; egov-law-search cannot be ticked without a laws.e-gov.go.jp seed, but can be read) |
| try per-crawl values | Seed `https://laws.e-gov.go.jp/` and tick egov-law-search: the field for the required variable `query` appears. Its value is sent as `variables` and shows under 渡した値 (values passed) when you open the row. Writing `defineParams` in your own script makes a field appear too: the stand-in answers `POST /api/scripts/check` by reading the source with a regular expression (only the stand-in takes this shortcut; the real reader walks the syntax tree in ts-compile-service, and the stand-in's `diagnostics` are limited to `BH0002` and `BH0004`, because it does not type-check). The stand-in answers in the ledger's (v0.80.0) order and wording: a required variable missing (`missing variables`, before any other check on the values), one name declared with two kinds or two shapes (`conflicting params`), a secret's name passed as a variable (`secrets cannot be passed as variables`), a variable no script declared (`unknown variables`), a value that does not fit its declaration (`invalid variables`, with the reasons in `hint`), a required secret missing from Windmill (`unknown secrets`, with name, path and a `hint`), and a variable there that is not a secret (`not a secret variable`). The shape of a script of your own's declarations gets the ledger's schema wording; `inline.params` takes secrets only, and a variable there or a name declared twice gets `invalid params`. The scenario's `windmillSecrets` (names of existing secret variables) and `windmillVariables` (names that exist but are not secret) stand in for Windmill. Declaring a secret can only be tried by sending `inline.params` of a script of your own straight to the ledger's API (the view has no field for it). Crawl `5b0c0007` in the scenario carries the variable `query` and the secret `api_token`, so its opened row shows 渡した値 and 使ったシークレット. The stand-in, like the ledger, writes a secret's value nowhere |
| try the User-Agent box | Press Headless を外す型を入れる in the new crawl view, or type your own text. The stand-in refuses the wrong form of the text with the ledger's wording and shows the text in the opened row |
| try the rules | Choose リンクを辿る in the new crawl view. The stand-in checks the rules the way the ledger v0.62.0 does — the same three 400s with the same wording, the same answer from `/api/crawl-rules/check` — and answers `/api/crawls/:id/decisions`. Crawl `5b0c0007` in the scenario carries `rules`, `decisions` and `robots`, with one rule that never matched. **`same-site` is approximated**: the stand-in has no Public Suffix List and takes the last two labels of the host name as the site, so it reads `example.co.jp` and `other.co.jp` as one site (the ledger, with tldts, does not) |
| see pages and logs | Give a crawl in the scenario `pages`: page rows, each with a `log` in the shape of BrowserHive's answer (`counts` may be left out; it is then counted from the lines). The stand-in answers the ledger's `/api/crawls/:id/pages` (`after` and `limit`; the body's `next` says where it continues) and `/api/crawls/:id/pages/:page/log`, and gives each entry of `failures` a `page`. An `after` that is not all digits, or a `limit` out of range, gets a 400. For a page without `log`, it answers why the log cannot be read (the scenario's `logReason`; otherwise `not-captured` for a page without a taskId, `no-log` for one with). Crawl `5b0c0009` in the scenario has a page that timed out (with warn and error lines), a page with dropped and cut-short lines, and a page robots.txt kept the crawl from taking. A crawl without `pages` lists none. To see 続きを読む (read on), give a crawl more pages than one batch of the ledger (the stand-in's batch is the ledger's default, in `pageList` in `sandbox/fake-ledger.mjs`) |
| see rows with scripts | Give a crawl in the scenario a `scripts` list (a script written on the spot carries `inline`). The bundled scenario has a crawl that ran one and completed, and one that failed at the compile step. Like the ledger, the stand-in leaves the source out of a crawl's detail, and "put back in the form" fetches it from the route by name (`/api/crawls/:id/inline/:name`). The `sha256` of crawl `5b0c0008`'s autoscroll differs from the ledger's v1 on purpose, to show the warning a crawl's "read" link gives when a version number has been reused |
| try the search view | Type words in the search view (the bundled scenario gives two hits for ランプ). The stand-in answers from the scenario's `searchPages` (each archive's page-list lines; a line without `stage` is the document's) by the ledger's rule: for an archive with snapshot lines only the snapshots are searched, and `hidden` archives are left out. **The stand-in has no OpenSearch**: it picks the lines whose title or text contains the words, with no scoring or word splitting. A missing or empty `q`, or any other parameter, is a 400 with the ledger's schema message |
| see a crawl's bundle | Open crawl `5b0c0009` in the scenario: its row has replay ↗ next to run ↗, and in its pages table the captured pages have replay ↗ after their outcome (the crawl's `replayBundle` is at r2, and the pages' `bundledRev` are 1 and 2); the page that timed out and the one robots.txt kept out have none. `5b0c0003` could not write the version after r2 (its row still opens r2, and the opened row says why), and `5b0c0002` never wrote one (no replay ↗; the opened row says why). Give a crawl in the scenario `replayBundle` (`rev`, `pages`, `builtAt` and `error`; leave out `rev` for a crawl whose bundle only failed) and its pages `capturedAt` and `bundledRev`. The stand-in builds the key the way the ledger does (`org/<orgId>/crawls/<crawlId>/r<rev>/replay.json`). **The stand-in writes no bundle**: replay ↗ leads to nothing |
| ask for a fix | Open crawl `5b0c0008` (failed the type check). The stand-in answers `/api/crawls/:id/diagnostics` from the crawl's `diagnosed` in the scenario (the ledger's answer as it is; a crawl without it type-checks), and `POST /api/crawls/:id/inline/:name/fix` from its `fixes` (`{ status, body }` per inline script's name). **The stand-in never calls Claude**: a name not in `fixes` is a 404. `5b0c0008` carries one TS7006 and a fix that passed the check (lines 2–3; the fixed source type-checks under TypeScript 6.0.3 strict). To see another answer, give `fixes` a `status` such as 429 or 422 with the ledger's body |

There are things the stand-in does not do:

- **It does not imitate authorization.** Any identity gets through, so the screens for a missing
  permission do not appear here.
- **replay ↗ and run ↗ lead outside the sandbox.** The stand-in's rows, and their bundles, do not
  exist over there.
- The validation report says `wacz-validator unknown` (the image is built without `.git`).
- The red messages on the screen name capture-ledger commands as the fix. In the sandbox, read
  "the ledger" as the stand-in and "the daemon" as the `sandbox-validator` container.
- The shape of the stand-in's answers is copied from the ledger's code. When the ledger changes a
  field, the stand-in does not follow (`test/sandbox.test.mjs` pins the copied set of fields).
  Checking against the real thing happens on the `dev:up` stack.

Reading it with headless Chrome's `--dump-dom` never finishes, because the dashboard keeps fetching
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
  keeps serving `http://localhost:4321/dashboard/`, so stop it with
  `cd docs-site && npx astro preview stop` when you are done.
- **Change English and Japanese in the same PR.** The pairing check only compares file names, not
  contents. It does not need to be a literal translation: write the same facts in each language's
  own words.
- **Write links in the body as `[x](/page/)`.** The base (`/dashboard`) and `/ja` are added by
  `docs-site/src/plugins/hast-rebase-links.ts`. Links in the frontmatter do not go through it, so
  write those as `/dashboard/…`.
- **In Japanese, break lines after punctuation.** A line break in the middle of a sentence shows
  up as a space between characters.
- **In the Japanese pages, 名乗り means only who you look as.** What the issuer returns is an access
  token (アクセストークン). The forms that mixed the two up are watched by
  `scripts/check-terms.mjs`, which `npm run check` runs.

## Re-taking the screenshots

The pictures on the [Screens](/screens/) page are taken by `npm run docs:shots`
(`docs-site/scripts/docs-shots.mjs`) against the [sandbox](#opening-the-dashboard-in-the-sandbox). No
picture is taken by hand. CI does not take them (that needs the stand-in's containers): they are
taken locally, and CI watches what was taken.

```sh
npm ci --prefix docs-site            # once (the tool is a docs-site dependency)
npm run sandbox                      # in another terminal; wait until 7081 answers
npm run docs:shots                   # all of them; a picture whose pixels did not change is not written
npm run docs:shots -- start crawls   # only the named ones
```

- **After changing the dashboard, re-take the pictures before opening the PR.** Changing the dashboard
  (`public/`, the bundled coloring in `public/vendor/` included), the stand-in (`sandbox/`) or the
  tool makes `site:check` fail with 絵の元が、撮ったときと違う (the sources of the pictures differ from when the
  pictures were taken). Re-taking all of them sets the stamp in `shots.json` (`source`) to the
  sha256 of the current contents, and writes only the pictures whose pixels changed; a fix that
  changes nothing visible changes only the stamp. Do not copy the stamp by hand to turn it green:
  the pictures would stay stale.
- **Taking named pictures leaves the stamp alone.** Only a run that takes all of them brings it up
  to date.
- **The pictures are lossless WebP, at most 32 KB each and 226 KB in all,** because every re-take
  piles up in git. Going over makes `site:check` fail; then make the cropped box smaller, or lower
  its height limit (`maxHeight`), in `SHOTS` in `docs-shots.mjs`.
- **A picture meant to be read fits the docs' column.** The docs show a picture at its pixel size,
  and one wider than the column shrinks (at a 1280 window, a 960px picture shrank to 0.66 and its
  text could not be read). So every picture is taken in the same window (`WINDOW` in
  `docs-shots.mjs`) at a DPR (devicePixelRatio) of 1, and cropped to the column's width (`COLUMN`
  in `scripts/shots-source.mjs`, the column at a 1280 window). Only a table shown shrunk in the
  column (`wide: true` in `SHOTS`) may be wider. `site:check` reads the width from the picture
  itself and fails on one that is too wide.
- **The tool stops rather than take a picture it should not.** Before taking one, it checks three
  things: the width (within `COLUMN` unless wide), the crop's edges (no visible text crosses them),
  and the number marks (inside the crop, on top of no text). Text the dashboard hides itself (long
  lines in the reading pane, an ellipsis) does not count as cut. When it stops, fix how `SHOTS`
  crops (`maxWidth`, `maxHeight`, `snap`) or where a mark goes, or shorten the text in the
  stand-in's scenario (`sandbox/scenario.json`). Text spilling out of its own box is a bug in the
  dashboard.
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
