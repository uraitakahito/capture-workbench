---
title: Quickstart
description: Bring capture-workbench up (usually capture-ledger's dev:up does it), sign in and grant your user access, and fix things from the message you see
---

## Usually dev:up brings it up

On its own, capture-workbench shows nothing. It needs something to read (the ledger's API), an IdP
(identity provider) to sign in with, and the daemon that answers validation and the WACZ view.
Locally the IdP is [Floci](https://github.com/floci-io/floci) (a Cognito emulator), the compose
service `idp` of [capture-ledger](https://github.com/uraitakahito/capture-ledger) (the ledger that
decides which URLs get captured and records what came back). capture-ledger's `dev:up` starts all
of them, and the workbench as part of it, passing it the sign-in settings.

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
there is nothing to install. It does need the two sign-in settings in `.env`: copy
`.env.example` and set `WORKBENCH_OIDC_ISSUER` and `WORKBENCH_OIDC_CLIENT_ID` to `IDP_ISSUER` and
`IDP_WORKBENCH_CLIENT_ID` from capture-ledger's `.dev/idp.env` ([Configuration](/configuration/)).

```sh
npm run dev           # http://127.0.0.1:7080/
```

The ledger's API and Floci have to be up (the ones `dev:up` started are enough). 検証
(validate) and the WACZ view also need the daemon. If you would rather not start the ledger's
stack, open it in [the sandbox](/development/#opening-the-workbench-in-the-sandbox) instead:
`npm run sandbox` starts a stand-in for the ledger and the real daemon in containers, and serves
the workbench on 7081.

Changes under `public/` take effect when you reload the browser, because the server reads the
files from disk on every request. After changing `src/`, restart it; restarting drops your session,
so you sign in again. If the workbench that `dev:up` started already holds 7080, `npm run dev` says
so and exits (see the table below). To run both side by side, move yours to another port
(`WORKBENCH_PORT=7081 npm run dev`). Signing in there does not work against Floci, though: the
callback the IdP knows is the one on 7080, and Floci answers the sign-in with 400
`redirect_uri is not registered for this client` ([Configuration](/configuration/#signing-in)).

## Sign in, and grant your user access

Opening the workbench takes you to Floci's sign-in page. Type the user and password in
capture-ledger's `.dev/idp.env` (`IDP_USER` and `IDP_USER_PASSWORD`). Back on the workbench, the
top of the screen says `<user> (<groups>) としてサインインしています`, with a サインアウト (sign out)
link.

That user needs permission to submit crawls for the organization.

```sh
cd ../capture-ledger
pnpm run idp:grant    # once
```

The grant goes to the user's `sub` (the ID Floci gave it), not to its name. `dev:up` does this in its
`grant` step, so if you followed capture-ledger's quickstart, it is already done. Without it, the
top of the screen says `not found` in red and the lists stay empty. For a user without the
permission, the ledger returns an empty list of crawls and a 404 for the scripts, and the
workbench stops at that 404 without drawing the lists.

## Fix it from the message

The workbench itself is in Japanese, so the messages below are quoted as they appear. The
messages of `/login` and `/callback` reach the browser without the workbench's page, which is where
the language is chosen, so they carry English and Japanese side by side (separated by ` / `, or on
two lines). The English half is quoted here.

| Where | Message | What to do |
| --- | --- | --- |
| top of the screen (red) | `not found` | Your user has no permission. Run the `idp:grant` above |
| `/login` | `Sign-in is not configured: set WORKBENCH_OIDC_ISSUER and WORKBENCH_OIDC_CLIENT_ID …` | The workbench was started without the sign-in settings. Set them ([Configuration](/configuration/)), or let `dev:up` start it |
| `/login`, or top of the screen (red) | `Cannot reach … (…). Look at the IdP line of pnpm run dev:status in capture-ledger / …` | Floci does not answer. Look at the IdP row of `dev:status` |
| `/login`, or top of the screen (red) | `The discovery of … answered …. If the Floci pool was recreated, run pnpm run dev:up --from idp in capture-ledger / …` | Floci answers, but not for this issuer: its pool was made again. Run the command it names |
| `/callback` | `Could not sign in / サインインできませんでした: unknown state: sign in again (/login) / …` | The sign-in took too long, was used twice (the back button), or the workbench restarted in between. Open `/login` again |
| `/callback` | `Could not sign in / サインインできませんでした: could not exchange the code for a token / …: …` | The IdP refused the code; its answer follows the last colon. Open `/login` again |
| top of the screen (red) | `… に届かない (…)。capture-ledger で pnpm run api は動いているか?` | The ledger's API is not up. Start it with `dev:up` |
| validation cell, WACZ view | `… に届かない (…)。capture-ledger で pnpm run dev:up --from validator は済んでいるか?` | The daemon is not up. Run the command it names |
| sign-in line | `サインインしていません` | There is no session. If it stays, the workbench has no sign-in settings; `/login` says which are missing |
| sign-in line | `workbench 自身に届きません` | The workbench's own server has stopped. Start it again |
| footer | `取りに行けませんでした（上の表は最後に描けたもの）` | The reason is the red message at the top. The tables are the last ones that could be drawn |
| script collection view (red) | `登録済みのスクリプトがありません。…` | The ledger has no scripts to run. Import them with the command in the message |
| new crawl view, under 始める | `404 —— not found` | Your user may not start crawls. Run the `idp:grant` above |
| new crawl view, under 始める | `404 —— Route POST:/api/crawls not found` | The ledger does not know where to send crawls (Windmill). The `dev:up` stack has it |
| crawls view (it moves there) | the running row is marked | A 409: only one crawl runs at a time, overall. Wait for the marked row to finish |
| terminal | `127.0.0.1:7080 は、既に動いている workbench です (pid …)。` | Just open it. To restart it, `pnpm run dev:up --from workbench` |
| terminal | `127.0.0.1:7080 は別のものが握っています …` | Find out what it is with `pnpm run dev:status`, clean up with `pnpm run dev:down` |

When something fails, the workbench keeps its tables. An empty table would read as "there is
nothing to see", which you could not tell apart from "it could not be fetched".
