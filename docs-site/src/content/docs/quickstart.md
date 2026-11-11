---
title: Quickstart
description: Bring capture-workbench up (usually capture-ledger's dev:up does it), grant your identity access, and fix things from the message you see
---

## Usually dev:up brings it up

On its own, capture-workbench shows nothing. It needs something to read (the ledger's API and the
development issuer) and the daemon that answers validation and the WACZ view. The `dev:up` of
[capture-ledger](https://github.com/uraitakahito/capture-ledger) (the ledger that decides which
URLs get captured and records what came back) starts all of them, and the workbench as part of it.

```sh
cd ../capture-ledger
pnpm run dev:up       # prints the workbench's URL when it is done
open http://127.0.0.1:7080/
```

`dev:up` expects this repository next to capture-ledger (`../capture-workbench`). If you keep it
somewhere else, use `pnpm run dev:up --workbench <path>`. How the whole stack comes up is in
capture-ledger's [quickstart](https://uraitakahito.github.io/capture-ledger/quickstart/).

| To | Run in capture-ledger |
| --- | --- |
| restart only the workbench | `pnpm run dev:up --from workbench` |
| see what is running | `pnpm run dev:status` |
| stop everything | `pnpm run dev:down` (also stops what runs on the host) |

## When you only work on the workbench

If you only change the workbench, start it from this repository. It has no npm dependencies, so
there is nothing to install.

```sh
npm run dev           # http://127.0.0.1:7080/
```

The ledger's API and the issuer have to be up (the ones `dev:up` started are enough). 検証
(validate) and the WACZ view also need the daemon. If you would rather not start the ledger's
stack, open it in [the sandbox](/development/#opening-the-workbench-in-the-sandbox) instead:
`npm run sandbox` starts a stand-in for the ledger and the real daemon in containers, and serves
the workbench on 7081.

Changes under `public/` take effect when you reload the browser, because the server reads the
files from disk on every request. After changing `src/`, restart it. If the workbench that `dev:up`
started already holds 7080, `npm run dev` says so and exits (see the table below). To run both
side by side, move yours to another port (`WORKBENCH_PORT=7081 npm run dev`).

## Grant your identity access

By default the workbench identifies itself to the ledger with this machine's user name
(`WORKBENCH_SUBJECT` in [Configuration](/configuration/)). That name needs permission to submit
crawls for the organization.

```sh
cd ../capture-ledger
pnpm run fga:grant submitter "$(whoami)" acme   # once
```

If you followed capture-ledger's quickstart, this is already done. Without it, the top of the
screen says `not found` in red and the lists stay empty. For an identity without the
permission, the ledger returns an empty list of crawls and a 404 for the scripts, and the
workbench stops at that 404 without drawing the lists.

## Fix it from the message

The workbench itself is in Japanese, so the messages below are quoted as they appear.

| Where | Message | What to do |
| --- | --- | --- |
| top of the screen (red) | `not found` | The identity has no permission. Run the `fga:grant` above |
| top of the screen (red) | `… に届かない (…)。capture-ledger で pnpm run oidc:issuer は動いているか?` | The development issuer is not up. Start it with `dev:up` |
| top of the screen (red) | `… が名乗りを断った (…)。…` | The parentheses hold the issuer's answer. `subject is required` means `WORKBENCH_SUBJECT` is only whitespace ([Configuration](/configuration/)). Any other answer means something other than the development issuer is answering at `WORKBENCH_ISSUER_URL`; see who holds 9099 with capture-ledger's `pnpm run dev:status` |
| top of the screen (red) | `… に届かない (…)。capture-ledger で pnpm run api は動いているか?` | The ledger's API is not up. Start it with `dev:up` |
| validation cell, WACZ view | `… に届かない (…)。capture-ledger で pnpm run dev:up --from validator は済んでいるか?` | The daemon is not up. Run the command it names |
| identity line | `workbench 自身に届きません` | The workbench's own server has stopped. Start it again |
| footer | `取りに行けませんでした（上の表は最後に描けたもの）` | The reason is the red message at the top. The tables are the last ones that could be drawn |
| script collection view (red) | `台帳にスクリプトがありません。…` | The ledger has no scripts to run. Import them with the command in the message |
| new crawl view, under 始める | `404 —— not found` | The identity may not start crawls. Run the `fga:grant` above |
| new crawl view, under 始める | `404 —— Route POST:/api/crawls not found` | The ledger does not know where to send crawls (Windmill). The `dev:up` stack has it |
| crawls view (it moves there) | the running row is marked | A 409: only one crawl runs at a time, overall. Wait for the marked row to finish |
| terminal | `127.0.0.1:7080 は、既に動いている workbench です (pid …)。` | Just open it. To restart it, `pnpm run dev:up --from workbench` |
| terminal | `127.0.0.1:7080 は別のものが握っています …` | Find out what it is with `pnpm run dev:status`, clean up with `pnpm run dev:down` |

When something fails, the workbench keeps its tables. An empty table would read as "there is
nothing to see", which you could not tell apart from "it could not be fetched".
