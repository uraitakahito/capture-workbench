---
title: Configuration
description: Under capture-ledger's dev:up no .env is needed. What you can change is which IdP you sign in with and where to look — the environment variables and the order they are read in
---

## No .env needed under dev:up

When capture-ledger's `pnpm run dev:up` starts the workbench, it passes the two sign-in lines
(`WORKBENCH_OIDC_ISSUER` and `WORKBENCH_OIDC_CLIENT_ID`), and everything else has a default. Every
line in `.env.example` is a comment. Copy it only when you start the workbench by hand, or want to
change where to look.

```sh
cp -n .env.example .env    # then uncomment the lines you need
```

[capture-ledger](https://github.com/uraitakahito/capture-ledger) (the ledger that starts crawls and
records what came back) requires values that are only known after something has run, such as the
ids of OpenFGA (the authorization service). The workbench has two such values: the issuer of the
IdP (identity provider, the service you sign in with) and the workbench's app client ID there.
Locally the IdP is [Floci](https://github.com/floci-io/floci) (a Cognito emulator), and its pool ID
is part of the issuer, which changes whenever the pool is made again. So neither has a default:
`dev:up` reads them from capture-ledger's `.dev/idp.env` (`IDP_ISSUER` and
`IDP_WORKBENCH_CLIENT_ID`). Starting by hand, copy those two values into `.env`. The other
destinations are fixed loopback addresses. There are no secrets.

## Environment variables

| Name | Default | What it decides |
| --- | --- | --- |
| `WORKBENCH_PORT` | `7080` | The workbench's port. It binds to loopback (`127.0.0.1`) only |
| `WORKBENCH_LEDGER_URL` | `http://127.0.0.1:7070` | The ledger's API |
| `WORKBENCH_OIDC_ISSUER` | none | The IdP's issuer (`iss`). Locally, `IDP_ISSUER` in capture-ledger's `.dev/idp.env` |
| `WORKBENCH_OIDC_CLIENT_ID` | none | The workbench's app client ID at the IdP. Locally, `IDP_WORKBENCH_CLIENT_ID` in the same file |
| `WORKBENCH_REPLAYWEB_SERVER_URL` | `http://127.0.0.1:8899` | Where "ReplayWeb.page ↗" goes (replayweb-server, which serves ReplayWeb.page unmodified): one WACZ from an archive row or a search hit, and the crawl's bundle from a crawl row or a page row |
| `WORKBENCH_CAPTURE_PLAYER_URL` | `http://127.0.0.1:8897` | Where "Web Capture ↗" goes (capture-player, a modified ReplayWeb.page). The link has the same shape as "ReplayWeb.page ↗"; only the origin differs |
| `WORKBENCH_WINDMILL_URL` | `http://127.0.0.1:8000` | Where "run ↗" on a crawl row goes |
| `WORKBENCH_WINDMILL_WORKSPACE` | `crawler` | The Windmill workspace "run ↗" opens |
| `WORKBENCH_VALIDATOR_URL` | `http://127.0.0.1:7180` | The daemon of [wacz-validator](https://github.com/uraitakahito/wacz-validator) (which checks a WACZ rule by rule) that answers validation and the WACZ view |

This table is checked against `src/server.mjs` and `.env.example` (`npm run site:check`). When
you add a variable, change all three.

### Signing in

You sign in on the IdP's sign-in page, and the workbench turns the code that comes back into an
access token (authorization code with PKCE, Proof Key for Code Exchange). In production the IdP is
Amazon Cognito; locally it is Floci, the compose service `idp` of capture-ledger, which
capture-ledger's `pnpm run idp:bootstrap` sets up. The routes are in [Routes](/routes/).

- **The app client is public.** It has no secret; PKCE keeps a code that someone else catches from
  being turned into a token.
- **Tokens live only in the server's memory.** The browser gets an HttpOnly cookie
  (`workbench_session`) that holds a session ID. Restarting the workbench drops every session, and
  the next request goes to sign in again.
- **The callback must match the IdP's registration exactly.** It is
  `http://127.0.0.1:<WORKBENCH_PORT>/callback`. `idp:bootstrap` registers the one on 7080, so on
  another port the sign-in against Floci does not come back.
- **Locally, the sign-in is a convenience, not a protection.** Floci's admin API accepts its
  default key, so anything that reaches it can make a user and sign in as that user (capture-ledger's
  [development environment](https://uraitakahito.github.io/capture-ledger/development-environment/)).
  That is one reason the workbench never leaves loopback.

### The workbench does not build destinations

Where replayweb-server and Windmill live is a fact of the deployment. The ledger only returns an
`objectKey`, the key of a crawl's bundle and a run id, so the server decides in one place where to
open them and hands that to the browser through `/healthz` (see [Routes](/routes/)).

Every "ReplayWeb.page ↗" and "Web Capture ↗" hands the viewer a path on the viewer's own origin, never a URL of the store: `/wacz/`
and the key, with each `/`-separated part of the key percent-encoded, as the value of `?source=`
(encoded once more as a query value). replayweb-server (v0.3.0 and later) decodes each part once,
so a key that itself contains `%` (BrowserHive writes labels into keys percent-encoded) reaches the
store as it is. The rule is `replaywebSourceHref` in `public/replayweb.js`, the same for one WACZ and for
a crawl's bundle.

A crawl's bundle also needs a replayweb-server that answers the bundle's page lookups (`/q/…`): ReplayWeb.page reads
the bundle's WACZ files and its page index from paths on its own origin.

## Order of reading

`npm run dev` reads `.env` and then `.env.local` (if they exist; a missing file does not stop
it).

- If a name is in both, `.env.local`, read later, wins.
- A variable you pass in the shell wins over both files, so you can change something just for
  one run: `WORKBENCH_PORT=7081 npm run dev`.

## Empty means unset

`NAME=` with no value falls back to the default (the same side as POSIX `${VAR:-word}`), which
matches the other [Web Capture](https://uraitakahito.github.io/capture-ledger/#web-capture) repositories. If you do not want to set a value, comment the whole line
out.

## 7080, not 7000

macOS's ControlCenter (AirPlay Receiver) holds `*:7000`. Binding to `127.0.0.1:7000` still
works, which makes it easy to miss, but when `localhost:7000` resolves to `::1` it reaches
AirPlay. The tools that look up a port's owner (capture-ledger's `dev:status` and `dev:down`)
would also keep reporting "something else holds it". So the workbench takes 7080, next to the
ledger's 7070.
