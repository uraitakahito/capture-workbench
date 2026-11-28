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

How the whole stack comes up is in capture-ledger's [quickstart](https://uraitakahito.github.io/capture-ledger/quickstart/).

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

The ledger's API and Floci have to be up (the ones `dev:up` started are enough). **Validate**
(検証) and the WACZ view also need the daemon. If you would rather not start the ledger's
stack, open it in [the sandbox](/development/#opening-the-workbench-in-the-sandbox) instead:
`npm run sandbox` starts a stand-in for the ledger and the real daemon in containers, and serves
the workbench on 7081.

## Sign in, and grant your user access

Opening the workbench takes you to Floci's sign-in page. Type the user and password in
capture-ledger's `.dev/idp.env` (`IDP_USER` and `IDP_USER_PASSWORD`). Back on the workbench, the
top of the screen says `Signed in as <user> (<groups>)`, with a **Sign out** (サインアウト)
link. **Sign out** signs you out of both the workbench and the IdP and lands on Floci's sign-in
page, where you can sign in as another user.

That user needs permission to submit crawls for the organization.

```sh
cd ../capture-ledger
pnpm run idp:grant    # once
```

The grant goes to the user's `sub` (the ID Floci gave it), not to its name. `dev:up` does this in its
`grant` step, so if you followed capture-ledger's quickstart, it is already done. Without it, the
top of the screen says `Not found` in red and the lists stay empty. For a user without the
permission, the ledger returns an empty list of crawls and a 404 for the capture scripts, and the
workbench stops at that 404 without drawing the lists.
