---
title: Routes
description: What capture-workbench's server answers — /healthz, signing in, the pass-through to the ledger, the routes that write (starting a crawl, asking how to fix an inline script), the route that asks what an inline script declares, and the /wacz/ routes into a WACZ. The Host check, which headers pass, and what failures look like
---

capture-workbench's server only relays. The workbench's logic lives in the browser (`public/`); all the
server does is provide a way to the ledger and the daemon, and serve the workbench's files. The
moment logic lived on the server, there would be a copy of what the ledger knows, so it does
not.

| Route | Answered by |
| --- | --- |
| `GET /healthz` | the server itself (liveness, and the settings the workbench needs) |
| `GET /login`, `GET /callback`, `GET /logout` | the server itself (signing in on the IdP, and signing out) |
| `POST /api/crawls` | the ledger (writes: starts a crawl) |
| `POST /api/crawls/:id/inline/:name/fix` | the ledger (writes: asks how to fix an inline script's type errors) |
| `POST /api/schedules` | the ledger (writes: makes a schedule) |
| `POST /api/schedules/:id/<action>` | the ledger (writes: `pause`, `resume`, `run`, `repin`, `delete`) |
| `POST /api/crawls/:id/failed` | the ledger (writes: closes a crawl left running) |
| `POST /api/scripts/check` | the ledger (asks what an inline script declares; writes nothing, and goes through the same checks because the source travels in the body) |
| `/api/*` (the rest) | passed through to the ledger (GET only) |
| `/wacz/:id/…` | signed by the ledger, then answered by the daemon |
| anything else | the files in `public/` |

The routing is in `src/server.mjs`; parsing and rewriting the `/wacz/` routes is in
`src/wacz.mjs`.

Every route refuses with a 403 unless the request's `Host` is `127.0.0.1:<port>` or
`localhost:<port>`. That stops a page from another site from reading the workbench as if it were
its own origin, by pointing its domain name at 127.0.0.1 (DNS rebinding).

## /healthz

Returns liveness and the settings the workbench needs.

```json
{
  "ok": true,
  "signedIn": { "user": "alice", "groups": ["acme"] },
  "replaywebServerOrigin": "http://127.0.0.1:8899",
  "capturePlayerOrigin": "http://127.0.0.1:8897",
  "windmillOrigin": "http://127.0.0.1:8000",
  "windmillWorkspace": "crawler",
  "writeLimit": 1048576
}
```

The workbench reads it when it opens, to learn who is signed in and where the deep links go.
`signedIn` comes from the access token's `username` and `cognito:groups`, read without checking the
signature (the ledger is the one that checks it). It is `null` without a session.
`writeLimit` is the largest body, in bytes, the route that writes accepts; the new crawl view stops
before sending a bigger one.
It does not live under `/api/`: that is where the ledger is passed through, and mixing this
server's answers in would make it unclear who answered.

## /login, /callback, /logout — signing in

You sign in on the IdP (identity provider: Amazon Cognito in production, locally
[Floci](https://github.com/floci-io/floci), the compose service `idp` of capture-ledger). The flow is
authorization code with PKCE (Proof Key for Code Exchange). The code is in `src/auth.mjs`.

- `GET /login` reads the IdP's discovery (`<WORKBENCH_OIDC_ISSUER>/.well-known/openid-configuration`)
  once, remembers a fresh `state` and PKCE verifier, and redirects to the IdP's sign-in page. Without
  `WORKBENCH_OIDC_ISSUER` and `WORKBENCH_OIDC_CLIENT_ID` it answers a 503 that names them.
- `GET /callback` is where the IdP sends you back. **It checks the `state`**, and each one works
  once: a callback another page made, one that took too long, or a second use is a 400. It turns the
  code into tokens at the IdP's token endpoint, keeps them in a session in memory, sets the cookie
  `workbench_session` (HttpOnly, SameSite=Lax) and redirects to `/`.
- `GET /logout` drops the session and the cookie, and redirects to `/`.
- `/` without a session redirects to `/login` (when the sign-in is configured).

The callback is `http://127.0.0.1:<WORKBENCH_PORT>/callback`, and it must match what the IdP has
registered exactly. These routes are GET, because the way back from the IdP is a GET redirect, so
the checks of the routes that write (`Origin`, JSON) do not apply; the `state` and PKCE refuse a way
back that another page made.

## /api/* — passed through to the ledger

The ledger does not return CORS (Cross-Origin Resource Sharing, which lets pages from another
origin call it) headers (`OPTIONS /api/archives` is a 404). Since the browser
cannot call it directly, the server relays it to make it same-origin.

- The path and query go through unchanged, as a GET. Any other method is a 405 (the routes that
  write are the `POST` routes below).
- Your session's access token is attached as `Authorization: Bearer`. Without a session it
  answers 401 `{"error":"サインインしていません","login":"/login"}`, and the page goes to `/login`.
- **On a 401 from the ledger it gets a new token with the refresh token and retries once.** It does
  not track the token's lifetime: when the IdP's pool is made again its keys change, so a clock
  that says "still valid" cannot be trusted. A 401 says both "expired" and "the keys changed" in
  the same way. If the refresh token gets nothing, the session is dropped and the answer is a 401
  (`サインインが切れました`) that sends you to sign in again.
- The ledger's status, `content-type` and body are returned as they are.

Which ledger routes are read is decided by the workbench (`public/app.js`); the server does not
choose. It keeps no list of allowed routes. So the ledger's `GET /api/crawl-rules/check` (the new
crawl view checking its rules as you write them), `GET /api/crawls/:id/decisions` (what an
opened crawl's rules decided), `GET /api/crawls/:id/pages` (an opened crawl's pages table) and
`GET /api/crawls/:id/pages/:page/log` (one page's log), `GET /api/crawls/:id/diagnostics` (the type
errors of a crawl that failed the type check) and `GET /api/search` (the search view's full-text
search) need nothing here: they are reads, and pass through like the lists. The ledger says where the pages table continues in the body (`next`),
since the relay returns only the status, `content-type` and body, and drops the other headers.

## POST /api/crawls — the route that starts a crawl

This is one of the routes of the workbench's server that write. The form on the crawls view
([Screens](/screens/)) uses it. The server does not check the contents: it hands the body that
passed the checks below to the ledger's `POST /api/crawls` as it is, and returns the answer as
it is. The ledger is the one that checks and decides the seed URLs, the policy (depth, page
limit, which scripts run), the `userAgent` and the per-crawl variables (`variables`: the spelling and number of the
names, the length and shape of the values, and whether a script that runs declared each name). Whether a
declared secret exists in Windmill is also the ledger's check; the workbench never touches a
secret's value (it lives in a Windmill variable, and is neither in the form nor in the body).

- **Only JSON from the workbench's own page gets through.** If the `Origin` is not the workbench it
  is a 403, if the `content-type` is not JSON it is a 415, and a body over 1 MiB (seed URLs and any
  script written in the form, together; the same limit as the ledger's `POST /api/crawls`) is a 413. This
  stops a page from another site from making your browser send the POST (CSRF). It does not
  rely on Chrome's Private Network Access.
- The access token is attached, and a 401 retried, the same way as for `/api/*` above.

| The ledger's answer | When |
| --- | --- |
| 202 `{"crawlId": …}` | accepted (it does not wait for the crawl to finish) |
| 400 `{"error": …}` | a seed URL that cannot be read, no registered scripts (with a `hint`), an unknown script id or the same id twice (with `ids`), a required variable missing or a variable no script declared (with `names`), a declared secret that is missing from Windmill or is not a secret there (with `secrets`: name and path), a hidden secret sent while the deployment's formats cannot have its value replaced (with `names` and a `hint`), and so on |
| 404 | the identity may not start crawls (`{"error":"not found"}`), or the ledger has nowhere to send crawls configured and does not serve the route at all |
| 409 `{"error": …, "crawlId": …}` | a crawl is already running (one at a time, overall); `crawlId` is the one in the way |
| 503 `{"error": "windmill unreachable"}` | the ledger could not ask Windmill whether a declared secret exists (the flow would not run either, so it does not start the crawl) |

The checks are `writeRefusal` in `src/lib.mjs`, which the tests call directly.

## POST /api/scripts/check — asking what an inline script declares

The new crawl view calls this once the box has stopped changing for 800 ms, with one request at a
time, and draws a field for each variable declared by `defineParams` ([Screens](/screens/)). The body
is `{ source, phase }`. The ledger creates no row: it asks ts-compile-service and returns
`{ params, diagnostics }`. The workbench's server passes the body and the answer through.

- It writes nothing, but it goes through the same checks as `POST /api/crawls` (`Origin`, JSON, 1 MiB) and
  gets the same token: the source travels in the body, and a page from another site must not be able to put
  ts-compile-service to work. The shapes are `isWriteRoute` in `src/lib.mjs`, with no query and nothing after `/check`.

| The ledger's answer | When |
| --- | --- |
| 200 `{ params, diagnostics }` | it could ask. `diagnostics` has the errors of the source except a missing required variable (`BH0001`), which is what the fields are for; the view shows `BH0002` and `BH0004` only |
| 400 | the body has another shape (Fastify's `message`) |
| 404 | the identity may not start crawls (`{"error":"not found"}`), or the ledger has no ts-compile-service configured and does not serve the route at all |
| 503 `{"error": "ts-compile unreachable"}` | ts-compile-service did not answer |

## POST /api/schedules — the routes for schedules

The schedules view ([Screens](/screens/)) and 定期にする on the new crawl view use these. There are
three shapes: `POST /api/schedules` makes a schedule, `POST /api/schedules/:id/<action>` acts on one,
and `POST /api/crawls/:id/failed` closes a crawl left running. Reading is `GET /api/schedules`, passed
through like any other read.

- The checks and the access token are the same as `POST /api/crawls` (`Origin`, JSON, 1 MiB). An action
  with no body still sends `{}`.
- **Only exactly these shapes are relayed.** The actions are `pause`, `resume`, `run`, `repin` and
  `delete`, and the id is hex digits and hyphens. The shapes are in `isWriteRoute` in `src/lib.mjs`.
- **Deleting is a POST too.** The relay only writes with POST, so the ledger's route has that shape.
- The ledger decides. For the cron expression and the request alike, the refusal is the ledger's words.

## POST /api/crawls/:id/inline/:name/fix — asking how to fix an inline script

This is also a route that writes. 直し方を訊く (ask for a fix), on an opened crawl that failed the type
check, uses it for an inline script with type errors ([Screens](/screens/)). The body is `{}`. The ledger asks
Claude, and returns **only a fix that passes the same type check** the crawl failed, with the reasons,
the replaced lines, the rounds and the cost; the workbench only draws the answer.

- The same checks as `POST /api/crawls` (`Origin`, JSON, 1 MiB), and the same token.
- **Only this exact shape is relayed:** the id is hex digits and hyphens, the name lowercase letters,
  digits and hyphens, and nothing follows `/fix`. No `%` and no `.` get through, because `fetch` folds
  `..` (and `%2e%2e`) out of a URL, which would land the POST on another of the ledger's routes. The
  shapes are `isWriteRoute` in `src/lib.mjs`.

| The ledger's answer | When |
| --- | --- |
| 200 `{ rounds, source, edits, notes, compiled, usage }` | a fix passed the check (`edits`: each replaced range with `before` and `after`; `usage.usd`: the cost) |
| 409 `scripts compile` | the scripts type-check now; there is nothing to fix |
| 422 | a required variable is missing from the crawl (`missing variables`; Claude is not called, and the view says to start again with the value), the errors are not in this script, two rounds did not pass (with the rounds and the cost), or Claude declined |
| 429 `claude budget exhausted` | the organization reached this month's limit (with `spentUsd` and `budgetUsd`); Claude is not called |
| 502 / 503 | Claude or ts-compile-service did not answer |
| 404 | the identity may not start crawls, the crawl or the inline script does not exist, or the ledger has no API key and does not serve the route |

## /wacz/:id/… — routes into a WACZ

These routes validate a WACZ (the archive format that packs captured pages into one ZIP) and
read inside it. The WARC files in it (which record the captured requests and responses in order)
and its indexes are read one window at a time.

| The workbench calls | Sent to the daemon | Returns |
| --- | --- | --- |
| `POST /wacz/:id/validate` | `POST /validate` | the validation report |
| `GET /wacz/:id/lines?path=&from=&count=` | `POST /lines` | a window of lines |
| `GET /wacz/:id/line?path=&n=` | `POST /line` | one whole line, and its fields |
| `GET /wacz/:id/records?path=&from=&count=` | `POST /records` | the records, walking the WARC from the start |
| `GET /wacz/:id/record?path=&offset=&length=` | `POST /record` | one record (WARC headers, HTTP, body) |
| `GET /wacz/:id/record/body?path=&offset=&length=` | `POST /record/body` | the image itself; raster only, with `nosniff` and `sandbox`, 415 otherwise |

This table is checked against `OPS` in `src/wacz.mjs` (`npm run site:check`). To add a route,
change `OPS`, `paramsFor` and this table.

- **Every route takes the same two steps.** Get a signature from the ledger's
  `POST /api/archives/:id/url`, then hand that URL to the daemon (why in that order is in
  [Inspecting a WACZ](/wacz/)).
- **The workbench calls GET; the daemon gets POST.** `<img src>` is a GET too, so the image itself
  can be fetched with a GET. Only validation is a POST from the workbench as well (it runs only when
  you press it).
- The body sent to the daemon is `{ "source": { "kind": "uri", "uri": "<signed URL>" }, …arguments }`.
  Validation's only argument is `locale`.

## Headers that pass

Which headers of the upstream answer (the ledger's or the daemon's) pass through is an
allowlist, `PASS_HEADERS` in `src/server.mjs`. The daemon's `date` and `connection` are not mixed
into the workbench's response. The image itself passes as bytes, together with the marks the daemon
put on it (`nosniff`, `sandbox`, `no-store`).

## What failures look like

A failure says what is missing. "You may not see it" and "it is not running" are never mixed.

| Status | When | Body |
| --- | --- | --- |
| 400 | an argument of a `/wacz/` route is missing or not a number; the ledger is not asked | `{"error":"from is required"}` |
| 400 | `/callback` with an unknown or used `state`, or a code the IdP would not turn into tokens | `サインインできませんでした: …` (text) |
| 401 | `/api/*` or a `/wacz/` route without a session, or the ledger refused the token and the refresh token got nothing | `{"error":"サインインしていません","login":"/login"}` or `サインインが切れました`; the page goes to `/login` |
| 403 | the `Host` is not the workbench's (any route); on the route that writes, also when the `Origin` is not the workbench | `{"error":"workbench の Host ではない"}` and so on |
| 405 | wrong method: on a `/wacz/` route (validation is POST, the rest GET), or on `/api/*` (GET only, except the route that writes) | `POST だけ`, `GET だけ` and so on, with an `Allow` header |
| 413 | the body sent to the route that writes is over 1 MiB | `{"error":"本文が 1048576 バイトを超えた"}` |
| 415 | the `content-type` sent to the route that writes is not JSON | `{"error":"JSON だけを受ける"}` |
| as the ledger said | the ledger refused (such as a 404 for an archive you may not view) | the ledger's body |
| 502 | the IdP, the ledger or the daemon cannot be reached, or the IdP's discovery failed | `{"error":"… に届かない (…)。…"}`, with one sentence on how to fix it |
| 503 | `/login` without `WORKBENCH_OIDC_ISSUER` and `WORKBENCH_OIDC_CLIENT_ID` | `サインインの設定が無い —— …` (text) |
| 404 | a file that is not in `public/`, or an extension that is not served | `not found` |

If the upstream breaks off while the answer is being streamed, the headers have already been
written, so the server closes the connection.
