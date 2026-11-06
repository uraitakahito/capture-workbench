---
title: Screens
description: What each view shows — crawls, start, archives, search, script collection and WACZ — how a crawl's state is worded, and how often the dashboard polls
---

The dashboard is a set of views you switch with the tabs at the top, and the `#` in the URL decides
which view is shown (`#crawls`, `#start`, `#archives`, `#search`, `#scripts`; in the search view it also
names the words searched, and in the script collection view what you are reading). The WACZ tab only appears once you
enter it with 開く (open) on an archive row. The dashboard itself is in Japanese; the tab names are
クロール, 新しいクロール, アーカイブ, 検索, スクリプト集 and WACZ.

The pictures on this page are taken against the stand-in ledger (the
[sandbox](/development/#opening-the-dashboard-in-the-sandbox)). Its scripts are copies from capture-scripts,
the same ones a real ledger lists; only autoscroll v2 is the stand-in's own version, there to show version chips.

![The tabs at the top: クロール, 新しいクロール, アーカイブ, 検索 and スクリプト集, with 新しいクロール selected](../../assets/screens/tabs.webp)

| View | What it lists |
| --- | --- |
| Crawls | one row per crawl: state, pages captured, pages discovered, number of WACZ files (the archive format that packs captured pages into one ZIP), time taken, links to the run and to replay (the whole crawl as one archive) |
| New crawl | the form that starts a crawl: seed URLs, registered scripts, depth, the values of the variables the ticked scripts declare, and a script of your own in a box as tall as the window; a registered script can be read in a tab of the right column |
| Archives | the WACZ files you can see; from a row, validate, open it in the WACZ view, or open in [replay](https://github.com/uraitakahito/replay) (which plays a WACZ back in the browser) |
| Search | the ledger's full-text search: type words, and the matching stages of archives (the document or a snapshot) are listed; from a row, open the WACZ view or replay |
| Script collection | the scripts that run inside the captured page and the types they are written against, to read line by line, older versions too; says so in red when the ledger has none |
| WACZ | inside one WACZ; see [Inspecting a WACZ](/wacz/) |

The top of the screen says who you are looking as, and that it is a development identity. The
footer shows how many rows are listed and how often the lists are fetched again.

## The lists are one page of the ledger

The crawls and archives views list only the first page the ledger returns (newest first). The
dashboard does not fetch further pages. For archives, the ledger returns only the ones in that page
that your identity may view, so there can be fewer rows than a page holds. The counts in the
footer are the rows on screen, not everything the ledger has.

The ページ (pages) table of an opened crawl, the list of the pages the ledger recorded for it, also
starts with the one batch the ledger returns. Further pages are fetched only when you press 続きを読む (read on), and
what you have read stays listed when the table is fetched again.

## Crawls

Each row is one crawl. It shows the state, the first 8 characters of the id, who started it and
for which organization, the first seed URL, pages captured, pages discovered, the number of
WACZ files and the time taken. "run ↗" at the right end opens the Windmill run in a new tab, and
"replay ↗" next to it opens the whole crawl in replay as one archive, once the ledger has written
the crawl's bundle.

![The crawls table: running, finished, cut-off and failed rows; rows whose crawl has a bundle have replay ↗ next to run ↗, and the running row reads replay r1（途中）↗](../../assets/screens/crawls.webp)

① state\
② the link to the run

- **Pages captured and pages discovered are separate columns.** Pages discovered
  (`pagesDiscovered`) counts what was found by following links, so a crawl of depth 0 ends up as
  "captured 1, discovered 0". Shown as `1 / 0` in one cell, the numerator looks bigger than the
  denominator, and people trip over it.
- **For a running crawl, the time taken is "so far".** A missing finish time means "not finished
  yet", not "no time".
- **run ↗ is the run of the last level that was handed over.** The link is built from the id of
  `lastJob` that the ledger returns, plus the Windmill origin and workspace the server hands out
  through `/healthz`. Rows where the ledger has no `lastJob` get no link.
- **replay ↗ opens the crawl as one archive.** After each level, the ledger writes the crawl's
  bundle (合本) to the store: a `replay.json` that lists every WACZ file of the crawl, and the
  index of its pages (`pages.json`) that replay's server answers from when replay looks a page
  up. replay opens them as one archive, so a link on a captured page leads to a page captured into
  another WACZ file.
  The link opens the list of pages (`#view=pages`) of the version the ledger points at
  (`replayBundle.key`), at the replay origin the server hands out through `/healthz`. A crawl with
  no bundle (nothing captured yet, or a ledger that writes none) gets no link. The ledger never
  stops a crawl over a bundle it could not write: an opened row says why first, in the ledger's
  words (`replayBundle.error`), and replay ↗ keeps opening the version written before, if there is
  one. The rules for these links are `replayBundleHref` in `public/replay.js`, pinned by
  `test/replay.test.mjs`.
- **A version written mid-crawl says so.** While a crawl runs, replay ↗ opens the version the
  ledger has written so far. Pages captured in later levels are not in it, so a link to one ends
  in Not Found in replay. The link therefore reads `replay r1（途中）↗` ("mid-crawl"), in the warning
  color, with an explanation on hover. A finished row reads the same while the version it points at
  is older than the end of the crawl (`builtAt` before `finishedAt`): the flow runs `report` (the
  crawl ends here) before `replay_bundle` (the last version is written here), so the last version
  arrives slightly later. A row whose next version could not be written keeps opening the earlier
  one the same way. The pages table of an opened row keeps the text "replay ↗" and only takes the
  color and the explanation. The rule is `isPartialBundle` in `public/replay.js`, pinned by
  `test/replay.test.mjs`.

![An opened row of the crawls view: what ran (欄に戻す next to the script written on the spot), the values passed and the secrets used, the count per rule, what was dropped, and the link to inspect in Windmill](../../assets/screens/crawl-detail.webp)

① what ran (in run order)\
② 欄に戻す (back to the form)\
③ 渡した値 (the values passed: variables) and 使ったシークレット (the secrets used)\
④ the count per rule\
⑤ Windmill で調べる (inspect in Windmill), the link to inspect_crawl

- **Click a row to see why it failed, what ran in the page, which values it was given, and the
  URLs that could not be fetched.** Only then does the dashboard fetch `/api/crawls/:id`. The ledger's
  `error` comes first, in its own words: a crawl that failed at the compile step captured nothing, so
  its list of failed pages is empty and would otherwise read like a success. Next is what ran, in the
  order it ran: registered scripts with their version and a 読む (read) link to the
  [script collection view](#script-collection) at the version the crawl ran, and scripts written in the form marked その場
  (written on the spot) with their size in bytes, each with a 欄に戻す (back to the form) button that
  takes you to the [new crawl view](#start-a-crawl). A site script carries its sites, as a chip such as
  `laws.e-gov.go.jp 用`. Then come the values: the variables the crawl was started with (the ledger's
  `variables`, name and value) and the secrets it used (`secrets`: the name, the path of the Windmill
  variable, and its `edited_at` when the ledger checked that it existed). A secret's value never
  appears: neither the ledger nor the WACZ holds it, only Windmill does. If the Windmill variable was
  rewritten while the crawl ran, the row says from which level. Above them is the `User-Agent` the crawl
  asked for, as typed, or HeadlessChrome のまま (still HeadlessChrome). A crawl given nothing reads 渡した値:
  なし (values passed: none), and a row from an older ledger without values shows nothing here. Last
  are the pages that failed, the latest 5 that the ledger returns (the state column gives the total); if none did, it says so and lists the seed
  URLs.
- **A crawl that failed the type check shows all of its type errors, and can ask for a fix.** When the
  ledger's `error` says the compile step failed with a 422, the dashboard also fetches
  `/api/crawls/:id/diagnostics`: the ledger sends the crawl's scripts to ts-compile-service again, and
  the table lists every error with its script, line and column, code and message (the `error` is cut
  at the ledger's limit and names only the first few). The table does not call Claude. An inline
  script with errors gets 直し方を訊く (ask for a fix) next to 欄に戻す: only pressing it calls Claude,
  through the ledger, which returns a fix only if it passes the same check. The answer shows the
  reasons, the replaced lines (removed and added, with line numbers), the rounds and the cost, and
  直した版を欄に戻す (put the fixed version in the form), which works like 欄に戻す with the fixed
  source (the name and phase stay as they were). Only the types were checked: read the diff, and
  capture once to see that the script still does what it did. Any other answer (nothing to fix, no fix
  passed, this month's limit reached, a ledger without the route) is one line, in the ledger's words.
- **An opened row also shows what the crawl's rules decided** (the ledger's
  `/api/crawls/:id/decisions`, fetched together with the detail). First, per rule, the distinct URLs it
  matched, added up over the levels; a rule that never matched is marked 当たっていません (not hit),
  since a rule that never fires usually does not say what its author meant. Then what was dropped,
  by host name: by a rule, by no rule, and the pages robots.txt kept the crawl from taking. A crawl
  that looked at no links says so in one line instead of listing rules that all show 0. Last is a
  link, Windmill で調べる (inspect in Windmill), to the script `f/waggle/inspect_crawl` in Windmill
  with this crawl's id already filled in (Windmill keeps a run's arguments in the URL's hash).

![The pages table of an opened crawl: four pages with their URL, outcome (replay ↗ after the captured ones) and warn and error counts, and the log of the page that timed out, opened, with lines from a script, an exception in the captured page and BrowserHive's timeout](../../assets/screens/crawl-pages.webp)

① the outcome (the ledger's state and reason), with replay ↗ for a page in the crawl's bundle\
② the warn and error counts\
③ ログ (log): opens the page's log, and closes it on a second press\
④ the level filter

- **An opened row also lists the crawl's pages** (the ledger's `/api/crawls/:id/pages`, fetched
  together with the detail), after what the rules decided. They come in the order the ledger
  recorded them, each with its URL, its outcome, the number of warn and error lines in its log, and
  a ログ (log) button. The outcome is the ledger's state (`captured`, `failed` and so on), not
  reworded, followed by the reason a page was skipped or failed, if any. The ledger keeps a page
  that never got a report as `pending` (whether it was captured is unknown), so in a crawl that has
  ended such a page reads `pending（報告なし —— クロールが先に終わった）` (no report: the crawl
  ended first) — a crawl that failed the type check captured nothing, and its seed would otherwise
  look like it is still waiting. A page whose WACZ is in the bundle the ledger points at has
  replay ↗ after its outcome: it opens that page inside the crawl's bundle, at the time it was
  captured (`#view=replay&url=…&ts=…`). What decides it is the ledger's `bundledRev`, the first
  version of the bundle that the page's WACZ went into: the link appears when it is no later than
  the version in the opened row's `replayBundle`. A page without a WACZ, a WACZ in no version yet,
  and a WACZ that went into a version newer than the one fetched with the row get no link. The
  warn and error counts are what the ledger counted in that capture's `.result.json`; a page whose
  counts the ledger has
  not read shows "—", which is not the same as 0. The table holds one batch from the ledger, with
  続きを読む (read on) when there is more. A ledger without the pages route gets a one-line note.
- **ログ (log) shows the log lines of that page.** The dashboard fetches the ledger's
  `/api/crawls/:id/pages/:page/log` once, when you press it (closing and opening again fetches
  again). The lines come in the order they arrived: the milliseconds since the capture started, the
  source (`script` and the script's id for a script's lines, `page` for the captured page's console
  and exceptions, `browserhive` for BrowserHive's own lines), the level, the message and the data.
  BrowserHive attaches whose line it is, so a script never writes its id. Messages are not reworded,
  and the data follows the message as JSON. The filter starts at すべて (all), and offers warn 以上
  (warn and above) and error だけ (error only); its numbers are how many lines each one shows. A line
  BrowserHive cut at its per-line limit is marked 途中で切った (cut short), and when lines were
  not kept, the box says how many (N 行は残していない（上限か方針で）, N lines not kept, by the limit or a policy):
  lines dropped over the limit for the capture, and lines a document withheld by a policy wrote to its
  console. A browserhive line in the log says which. For a page whose log
  cannot be read, the box gives the ledger's reason, as a short sentence and the reason itself (not
  captured yet or not captured, no `.result.json` recorded, missing from the store or not matching
  the contract, or captured by a BrowserHive from before logs were kept).
  When the page has a WACZ, WACZ の画面で開く (open in the WACZ view) above the box opens the same
  lines sealed in the WACZ (`logs/capture.jsonl`) in the WACZ view. A WACZ line is the answer's line
  with `profile` added, and the signature covers it. A WACZ BrowserHive took before WACZ Profile
  1.19.0 has no such entry.
- **An opened row stays open.** The table is rebuilt on every fetch, so the dashboard remembers the
  open rows by id and opens them again from the last answer. It fetches a row again only while the
  crawl is running or when its state has changed. Opened logs are remembered by page id too, and
  their boxes are moved rather than rebuilt, so they keep their scroll position and filter. They are
  forgotten when you close the row or when the crawl leaves the list.

### The state is worded together with stopReason

`state` alone is not enough. `succeeded` mixes crawls that followed everything to the end with
crawls that stopped at the depth or page limit. The dashboard words them apart using `stopReason`
(完走 for completed, 打ち切り for stopped at a limit), and shows an unknown `stopReason` as it
is, in parentheses. If some pages could not be fetched it adds the count (the ledger's
`pagesFailed`), as in 完走・2 枚取れず, and the row is not green even if everything was followed. A
crawl that captured nothing is closed as `failed` by the ledger, so it reads 失敗.

The wording rules are `stateOf` in `public/format.js`, pinned by `test/format.test.mjs`. The
tests read the same file the browser reads, so there is no copy to rot.

## Start a crawl

The 新しいクロール (new crawl) view starts a crawl. The left column holds the seed URLs, the registered scripts, the User-Agent box,
the per-crawl values (when a ticked script declares any), the depth and the 始める (start) button; the
right column holds the box for a script of your own, and how to follow links. The box
stretches to the bottom of the window and has line numbers on its left, so a large script can be
pasted, read, fixed a little and run. Write the seed URLs one per line, choose このページだけ (this
page only) or リンクを辿る (follow links), and press 始める. The right column has tabs: it switches to
a window for reading a registered script, and, while リンクを辿る is chosen, to 辿り方 (how to
follow).

![The left column of the new crawl view: the seed URL (e-Gov Law Search), script rows (a run-order number, a checkbox, and ↑↓) including the row for your own script, the site script egov-law-search, and autofetch left unticked as 既定では走らない, the field for the variable query that egov-law-search declares, the User-Agent box with its button, this page only or follow links, and 始める](../../assets/screens/start.webp)

① seed URLs\
② スクリプト (scripts): the run-order numbers, the checkboxes and 読む (read), and ↑↓\
③ クロールごとの値 (per-crawl values): the fields for the variables the ticked scripts declare\
④ User-Agent: the box and the button that fills in the form without Headless\
⑤ 始める (start)

![The right column of the new crawl view: the tab その場の TS, the name of the script, when it runs, and the script box](../../assets/screens/start-js.webp)

① the right column's tabs\
② スクリプトの名前 (name of the script)\
③ the script box

- **It sends the seed URLs, whether the depth is 0, what runs — only when it differs from the
  default — and the per-crawl variables, only those with a value.** このページだけ sends `maxDepth: 0`; リンクを辿る sends the rules, and the depth
  and the page limit only when they are written (empty, they are the ledger's defaults). With the default set the seeds decide (of the scripts in
  the default, those without sites and the site scripts for a seed's host) ticked and unmoved, and no script of your own, the form
  sends no `scripts`, and the ledger picks the same set in the same order from the seeds. A ledger with no scripts is still a
  400, and so, with its own message, is one in which no script fits the seeds. Otherwise it
  sends `scripts` in the order of the numbers (a script of your own set to 遷移の前 goes first);
  unticking all of them sends `[]`, which runs nothing. The dashboard checks neither the URLs
  nor the script's name; the ledger says what is wrong with a 400, naming the ids it refused.
- **The numbers show the order the scripts run in, and ↑↓ change it.** The ticked rows are numbered
  and run in that order. They start in the order of `catalog.json` in
  [capture-scripts](https://github.com/uraitakahito/capture-scripts) (from ledger v0.75.0), so ticking
  `autofetch` alone runs it after `autoscroll`. ↑↓ swap numbered rows. Unticking leaves the row where it is and only
  takes away its number and arrows. Site scripts that fit no seed collect at the bottom. A script of
  your own set to 読み込みの後 (after load) gets a row when you write it, first at the top, and moves
  with the others; one set to 遷移の前 (before navigation) gets no row and always runs first. The
  order you set survives re-fetching the list and starting a crawl; reloading the page resets it.
- **A site script can be ticked only when a seed is on its site.** A script with sites can be
  ticked only while one of the seeds is on one of those hosts. The seed's hostname must match
  exactly and its port is ignored (`laws.e-gov.go.jp` and `www.e-gov.go.jp` are different hosts).
  Writing a seed ticks the site scripts that fit it; the others cannot be ticked and say why, as in
  起点に laws.e-gov.go.jp がありません (no seed on laws.e-gov.go.jp). With no seed yet, they say
  起点を書くと選べます (write a seed to choose). A box you unticked stays unticked when the seeds
  change. The rule is the ledger's: naming a site script that fits no seed gets a 400 from it.
  The example is `egov-law-search` from capture-scripts (sites `laws.e-gov.go.jp`), which searches law titles
  within [e-Gov Law Search](https://laws.e-gov.go.jp/) for the word in the required variable `query`; seed
  `https://laws.e-gov.go.jp/` to choose it, as in the picture above.
- **The User-Agent box sets the crawl's `User-Agent`.** Left empty, nothing is sent and the browser's
  own value (with `HeadlessChrome`) goes out. The button Headless を外す型を入れる (put in the form without Headless)
  fills in `{chrome} BrowserHive`: BrowserHive turns `{chrome}` into the browser's own value without Headless, so
  a site that refuses Headless can be captured, and the text never goes stale when the browser is upgraded.
  For example, the [Prime Minister's Office of Japan](https://www.kantei.go.jp/) answers HTTP 404 to text containing
  `HeadlessChrome`. Started with the box empty and このページだけ (this page only), the page ends in
  `failed: http_error: HTTP 404: Not Found`: nothing is captured and no replay ↗ appears. Fill in
  `{chrome} BrowserHive` with the button and it is captured and opens with replay ↗ (checked on 2026-11-07; what a
  site answers can change). Whether to include the word `BrowserHive` is up to whoever types: with it, a site can tell that BrowserHive took the page and
  robots.txt is read under that name; without it, only the `*` rules are read. The dashboard does not check the text:
  the ledger refuses text of the wrong form (printable ASCII, at most 512 characters) with a 400, and the dashboard
  shows its sentence as it is. The text stays in the box after starting, like the variables and the
  script. The opened row of the crawls view shows the text as typed; the value actually sent is in the WACZ's
  `settings.userAgent`.
- **When a ticked script or your own script declares values, the クロールごとの値 (per-crawl values) box
  appears.** A script declares the variables it reads in its source with
  `const { query } = defineParams(z.object({ query: z.string().min(1).describe("…") }))`. For a script in
  [capture-scripts](https://github.com/uraitakahito/capture-scripts) the declarations are also in the
  `params` of its `catalog.json`; the ledger keeps them with each version and `GET /api/scripts`
  carries them. For your own script, the view asks the ledger once the box has stopped changing for
  800 ms (`POST /api/scripts/check`), so the field also appears after a file is read, 欄に戻す (back to
  the form) and 下敷きにする (use as a template). A variable (`kind: variable`) becomes one row with its
  name, its description and a field for the value, or a choice when the declaration is a `z.enum`:
  `query` in the picture above is declared by `egov-law-search` as the search word. A required declaration
  (no `.optional()`) is marked 必須 (required). Only the fields with a value are sent, as `variables`;
  an empty optional field is not sent and the script reads `undefined`.
  The values are remembered: after a 202, and when unticking a script removes its rows, they stay,
  and come back when the script is ticked again. The dashboard does not check them: the spelling of a
  name (a lowercase letter, then lowercase letters, digits and `_`, up to 64 characters), at most 32
  per crawl, values up to 4,096 characters and the shape the script declared are the ledger's rules. When a
  required field is empty, a name no script declared is sent or a value does not fit, the ledger answers
  400 naming it before it creates a row (under the left column you read something like
  `400 —— missing variables: query`). When your own script's declaration cannot be read, or the ledger
  cannot be asked, the reason is under the box in red: `BH0002` (the form cannot be read without running it),
  `BH0004` (a script that runs before navigation has nowhere to read a variable), or 宣言を確かめられません
  (could not check the declarations) with the ledger's sentence. Ordinary type errors are not shown
  there; the compile step reports them when the crawl runs. A secret (`kind: secret`) is
  listed under 使うシークレット (secrets used) by name only, with no field: its value is put by a
  person into the Windmill variable `f/waggle_secrets/<name>`, the ledger checks that it exists
  (otherwise a 400 naming it with its path), and Windmill resolves it for the script on every crawl.
  The value never reaches the dashboard, the ledger or the WACZ. No bundled script declares a secret,
  so this view passes variables only; your own script can declare a secret (`inline.params`) only when
  calling the ledger's API directly.
- **A script left out of the default is listed unticked.** It reads 既定では走らない (does not run
  by default) beside its name, as autofetch does in the picture above: a script whose entry in the
  `catalog.json` of [capture-scripts](https://github.com/uraitakahito/capture-scripts) says
  `"default": false`, every version of which the ledger keeps disabled. A crawl that names no
  scripts does not run it. Tick it and the form names it, and the ledger runs its newest version. A
  box you ticked is remembered like one you unticked, and a fetch does not reset it.
- **It shows the size before sending.** Under the box are the number of lines, the size of the body
  it will send (UTF-8 bytes) and how much of the limit that is. The limit is the one the writing
  route enforces, handed out by the server as `writeLimit` in `/healthz`. Over it, the line turns
  red and 始める cannot be pressed.
- **The name of your script becomes its id.** Write it in the box labelled スクリプトの名前 (name of the
  script) in the right column. The `inline-` in front stays: `close-banner` gives the id
  `inline-close-banner`. Start with a lowercase letter, then use only lowercase letters, digits and
  `-`, up to 57 characters (the ledger's rule). This view does not check it: a wrong or empty name is
  refused by the ledger with a 400, and under the left column you read something like
  `body/scripts/0/inline/name must match pattern "^[a-z][a-z0-9-]*$"`. The name is sent only when
  the box holds a script; with an empty box it is not used. The id appears in a crawl's list of what
  ran, as the source of its lines in a page's log, and in the archive's `behaviors/custom.jsonl`.
  BrowserHive attaches it to the lines your script logs (`__bh.log.info(…)` and so on) and reports
  (`__bh.report(…)`), so the script itself never writes it. 欄に戻す (back to the form) fetches your
  script back by this name.
- **A script of your own is type-checked as strict TypeScript** at the first level's compile step,
  and a single error fails the crawl; open its row to read the number of diagnostics and the first
  five. Wrap it in an IIFE, give the elements you look up a type, and use `?.`. It cannot contain
  `export`: compile stops it with `BH0006`, because the page would get a syntax error and nothing
  would run.
- **It can use Zod.** Start with `import { z } from "zod"` or `import * as z from "zod/mini"`. Compile
  stops any other form with `BH0003`, and stops it before navigation (遷移の前) with `BH0004`.
  ts-compile-service bundles only the names in use into the JavaScript, which adds about 85 KB to the
  script (15 KB for `zod/mini`). A crawl still succeeds when a value has the wrong shape, so use
  `safeParse` and `__bh.log.error` rather than `parse`.
- **For a bundled script, tick 型を検査しない (skip the type check).** Ticking it puts
  `// @ts-nocheck` on the first line of the box, and unticking takes it off: what you see is what is
  sent, and the ledger's sha256 covers it too. A pasted script that already starts with that line
  shows the box ticked.
- **The box does not wrap lines,** so the line numbers stay in step; long lines scroll sideways.
  読み込みの後 (after load) runs once in the main frame; 遷移の前 (before navigation) runs in every
  frame on every navigation and has no `__bh`. ファイルを読む (read a file) loads a file into the
  box, in the browser only; if the name box is empty, it takes the file name without its extension.
  Fix it before starting if it breaks the rule above (capital letters or `_`).
- **A registered script can be read in the right column.** Press 読む (read) next to its checkbox:
  a second tab opens in the right column, named like `autoscroll v2`, with the source of that
  version in colour. The view does not change. The box is only hidden: your script, its scroll
  position and the cursor stay, and the その場の TS (your script) tab brings it back. You can tick
  and untick while reading, and read a site script whose checkbox is disabled. One script is open
  at a time; another 読む replaces it, and × closes it. The window has 写す (copy), 下敷きにする
  (use as a template) and a link that opens the script in the [script collection view](#script-collection), which alone
  has the version chips and line URLs. With ⌘ or Ctrl held, the browser opens the script collection view in
  another tab instead.

![The right column of the new crawl view, reading the script autoscroll v2 in colour](../../assets/screens/start-read.webp)

- **リンクを辿る opens the 辿り方 (how to follow) tab.** It holds the depth and the page limit, the
  presets, and the rules. A rule is an action — 撮って辿る (capture and follow), 撮るだけ (capture
  only) or 落とす (drop) — and what it matches: `same-origin`, `same-host`, `same-site` or `any`
  (compared with the seeds), a lower-case host name (that host and the subdomains under it), or an
  `http(s)` URL (a prefix). The ledger tries the rules from the top, the first match decides, and a
  link no rule matches is dropped. The tab starts with ホストの中 (within the host); the presets
  サイトの中 (within the site), サイトの中＋外は 1 歩 (within the site, one step outside),
  ホストの中 and どこでも (anywhere) each hold a 撮って辿る rule, because the ledger refuses seeds
  that do not land on one. ＋ 落とす行を足す adds a drop rule at the top — below a broad 撮って辿る
  rule it could never match. The ↑ ↓ × buttons name their row for screen readers, and focus follows
  the row that moved.

![The 辿り方 tab of the new crawl view: depth 3 and 200 pages, the presets, four rules with the last one marked as covered by the third, and the sentence that restates them](../../assets/screens/start-rules.webp)

① 辿り方 (how to follow)\
② the presets\
③ the action of each rule\
④ the ledger's check of each rule\
⑤ adding a drop rule at the top\
⑥ what the crawl will do, restated

- **The ledger checks the rules as you write them.** After a 300 ms pause the view asks the ledger's
  `GET /api/crawl-rules/check` (it writes nothing, so it rides the same pass-through as the
  lists). Each row then says what the ledger read — 範囲 (scope), ドメイン (domain) or 前方一致
  (prefix) — or, in red, that it cannot be read or that an earlier row covers it; the sentence
  under the table restates what will be followed, in the ledger's reading (a URL prefix appears
  normalised). While the ledger says the rules cannot start, 始める cannot be pressed. When the
  ledger cannot be asked, nothing is blocked: starting gets its answer instead.
- **A 202 or a 409 takes you to the crawls view.** When the crawl is accepted, its row gets a mark;
  if a crawl is already running, the row in the way gets the mark (the ledger runs one crawl at a
  time, overall). An accepted crawl is running, so the footer starts polling every 2 seconds.
  Anything else (a 400, a 413, an unreachable server) stays in this view, in the ledger's own words
  under the left column.
- **After a 202 the seed URLs are cleared; your script and the values of the variables are kept,**
  since the usual next step is to fix it and run again.
- **欄に戻す (back to the form) brings you back here.** Open a row in the crawls view and press
  欄に戻す on a script of your own: this view opens with its name, phase and source. The source
  comes from the ledger's `/api/crawls/:id/inline/:name` (a crawl's detail only carries its size).
  The seed URLs and the ticked scripts are left alone. If the right column was showing a registered
  script, it switches back to the その場の TS tab.
- **下敷きにする (use as a template) in the [script collection view](#script-collection) brings a registered script
  here** as a script of your own, named `my-<id>` unless the name box already has one. Only the form
  that names the script's own id, `__bh.opts["<id>"]` (where it reads its options), is changed to
  `inline-<name>`; reports and log lines take no id, so they are left alone. The message under the
  left column says on which lines. The original is unticked,
  so it does not run twice. If the box already holds a script, the script collection view asks before
  replacing it. 下敷きにする in the right column's reading window does the same, and asks inside
  that window; afterwards the その場の TS tab is in front, and the reading window stays open for
  comparing. A site script's sites do not come along: a script of your own runs from any seed,
  and the check at the top of the script (comparing `location.hostname`) keeps it idle on other
  sites.
- **The types of `__bh` are one link away.** The note under the left column links to them
  (`#scripts/types/host.d.ts`); a plain click opens them in the right column's reading window.
- **The row gets a mark, and is not opened.** The mark is remembered by id and put back each time
  the table is redrawn.

It is sent through `POST /api/crawls` in [Routes](/routes/).

## Archives

The WACZ files you can see, newest capture first.

![The archives view: WACZ files, two of them validated (問題なし and 失敗 1)](../../assets/screens/archives.webp)

- **A `—` under 完全か (complete?) means "unknown".** The ledger's `waczComplete` is null for
  that row, which is not the same as 欠けあり (incomplete).
- **検証 (validate) only runs when you press it.** Opening the list does not run it. The result
  also stays in the row's 仕様どおりか (conforms?) cell, so after looking at several archives you
  can tell how each one did without pressing again. What the report shows is in
  [Inspecting a WACZ](/wacz/).
- **開く (open) enters the WACZ view** (`#wacz/<archiveId>`).
- **"replay ↗" opens the captured URL in replay.** The link is built from the replay origin the
  server hands out through `/healthz`, the `objectKey` the ledger returns, and the row's URL and
  capture time (`#view=replay&url=…&ts=…`). The page's own scripts run there, so pictures that the
  page shows with JavaScript appear too. The DOM snapshots BrowserHive took (before and after the
  scripts) are on replay's Pages tab. replay does not pick a start page on its own: it lists the
  pages newest first, and it does not read the WACZ's `mainPageURL`. It opens that one WACZ: to
  follow links into the crawl's other pages, open the crawl with replay ↗ on its row in the
  [crawls view](#crawls).

## Search

The view that searches the titles and text of captured pages with the ledger's full-text search
(`#search/<words>`).

![The search view: a search for ランプ (lamp) lists two hits, the first a document row and the second the after-behaviors snapshot, with the matching words marked](../../assets/screens/search.webp)

- **A hit is one stage of one archive.** The ledger indexes each line of a WACZ's page list: for a
  WACZ with snapshot lines only the snapshots (`after-load`, `after-behaviors`), and for a capture
  without snapshots (a document a policy withheld, say) the document's line. When both the
  before-search and the after-search stage of one archive match, two rows are listed.
- **Only archives you may see are listed.** The ledger filters with the same authorization as the
  archive list. The count is the number of rows listed; the ledger returns at most 50 at a time.
- **replay ↗ opens a document hit at the captured URL, and a snapshot hit at the snapshot itself.**
  The document opens with the page's scripts running; a snapshot is the DOM copy without scripts,
  the page as it was at that stage.
- **開く (open) enters the WACZ view** (only for archives listed in the archives view).
- **It fetches only when you press 探す (search) or open a search URL.** It does not poll like the
  other views.
- **It needs the ledger's full-text search (OpenSearch).** When that does not answer, the reason is
  shown in one red line (the ledger's `CAPTURE_LEDGER_OPENSEARCH_URL`).

## Script collection

The scripts that run inside the pages being captured, to read before writing one of your own, or
to see exactly what a crawl ran. On the left is a list in four groups: the scripts that run by
default (the newest enabled version of each id without sites, which is what a crawl runs when it
names none), the site scripts (those with sites, which run only when a seed is on their site), the
scripts that do not run by default (under 既定では走らない, those with no enabled version, whose
newest version runs when a crawl names them), and, under 書くための型 (types to write against),
`host.d.ts`, the types of `__bh`, the object the capture server puts in the page for scripts to
use. All but `host.d.ts` also appear as checkboxes under スクリプト (scripts) in the
[new crawl view](#start-a-crawl) (those that do not run by default unticked), where 読む (read)
next to one opens it in the right column.

![The list on the left of the script collection view: autoscroll (open) runs by default, the site script egov-law-search with its chip laws.e-gov.go.jp, autofetch under 既定では走らない, and host.d.ts under 書くための型](../../assets/screens/scripts.webp)

On the right is the TypeScript as it was written, with line numbers.

![The right of the script collection view: autoscroll v2 with its version chips, the line with its size and sha256, 写す and 下敷きにする, and the coloured source](../../assets/screens/script-read.webp)

| URL | Opens |
| --- | --- |
| `#scripts` | the first script in the list (the URL changes to name it) |
| `#scripts/autoscroll` | the version that runs by default (for a script that does not, the newest) |
| `#scripts/autoscroll@1` | version 1, enabled or not |
| `#scripts/autoscroll@1:33` | version 1, with line 33 marked and scrolled into the middle |
| `#scripts/types/host.d.ts` | the types of `__bh` |

- **The heading says which version you are reading.** Chips list every version of the id, the
  default one marked 既定 and disabled ones 無効. Under them are the line count, the size, the start of the sha256, the day
  it was imported, the options it is given (`{}` means the defaults written in the code), and
  whether it is the version that runs by default. A site script has its sites beside its name, and
  its default version reads 起点に laws.e-gov.go.jp があれば既定で走る版 (runs by default when a seed
  is on laws.e-gov.go.jp). A disabled version reads 無効（既定では走らない） (disabled; does not run
  by default).
- **Sites mark a script that only makes sense on certain sites.** The sites (`sites`) are a list
  of hostnames, written in the `catalog.json` of
  [capture-scripts](https://github.com/uraitakahito/capture-scripts) and kept by the ledger with
  each version. A site script runs by default only when one of the crawl's seeds is on one of those
  hosts. The rule holds for the whole crawl, so the script also runs on pages of other hosts the
  crawl reaches by following links; the script checks the hostname first and does nothing
  elsewhere.
- **Click a line to put it in the URL,** to send someone straight to it. This adds nothing to the
  browser history and does not redraw the view.
- **写す (copy) puts the source on the clipboard.** 下敷きにする (use as a template) takes it to the
  [new crawl view](#start-a-crawl) as a script of your own.
- **The source is colored.** The colors come from [Shiki](https://shiki.style) with the same
  TypeScript grammar as VS Code, in GitHub Light High Contrast or GitHub Dark Default to follow
  the screen's light or dark scheme (the pair whose colors all stay readable on the screen's
  backgrounds). The lines appear in one color first and the colors follow a moment later: the
  coloring runs off the page's main thread (in a worker), so even a long file can be read and
  scrolled at once. The marked line stays one color. If the colors cannot be loaded, a line above
  the source says so, and the source stays readable in one color.
- **The lines are the TypeScript's.** A crawl runs the compiled JavaScript, which is what the archive
  keeps in `behaviors/custom.jsonl`, and its lines are a few off from these in places.
- **読む (read) in a crawl's detail opens the version that crawl ran,** and carries the start of its
  sha256 as well. Version numbers can be reused (removing the newest version and adding one again
  gives the number to different bytes), so when the bytes differ, the view says so above the source.
- **Only what you open is fetched.** The list comes with the regular fetch and is redrawn only when
  it changes. The versions and the source of a script are fetched when you open it, and the types
  of `__bh` once, when you first open the view. The routes are capture-ledger's
  `GET /api/scripts/:id/versions`, `GET /api/scripts/:id/versions/:version` and
  `GET /api/host-types` (from v0.60.0; the sites from v0.61.0; the list, `GET /api/scripts`,
  carries the scripts that do not run by default, with `enabled: false`, from v0.64.0), passed through as in
  [Routes](/routes/).

**A ledger with no scripts is shown in red.** The capture server (BrowserHive) does not bring any scripts
of its own, so with no scripts in the ledger nothing runs inside the page. Nothing scrolls and nothing
lazy-loads, yet the capture still succeeds and an archive still comes out. The red message
includes the command that imports the scripts with [capture-ledger](https://github.com/uraitakahito/capture-ledger) (the
ledger that starts crawls and records what came back).

## Polling

While at least one crawl is running, the lists are fetched every 2 seconds; otherwise every 30
seconds. A crawl that has just finished keeps the 2-second pace until its last bundle version shows
up, for at most a minute. Without keeping a copy, the dashboard still looks live while something runs, and stays
quiet when nothing does. The search view does not poll; it fetches only when you search.

When a fetch fails, the dashboard keeps the last tables it could draw and shows the reason at the
top (see "Fix it from the message" in the [Quickstart](/quickstart/)).
