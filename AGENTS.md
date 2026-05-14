# Agent context

Non-obvious choices in this scaffold.

## Deployment

`@apptly/sass-dispatcher-worker` is bound to
`apptly.me` (APEX) and is the Cloudflare-for-SaaS
fallback for tenant custom hostnames. Host matching
in `@apptly/sass-dispatcher` needs to handle both the
literal apex and arbitrary custom-hostname strings;
the eventual `wrangler.toml` will route `apptly.me/*`
on the `apptly.me` zone plus the custom-hostname
trigger. Neither is wired yet — see the TODOs in
`apps/worker/wrangler.toml`.

## Compatibility floor

`apps/worker/wrangler.toml` pins `compatibility_date`
to the workerd shipped inside
`@cloudflare/vitest-pool-workers`, not the top-level
`wrangler`. The vpw-bundled workerd lags; bumping vpw
is the trigger to raise the date.

The `enable_nodejs_*_module` flags are pre-declared
to silence vpw's test-time injection logs. They are
not strictly needed for production but cause no harm.

## CLI bin / lib split

`apps/cli/src/bin.ts` and `apps/cli/src/index.ts`
are split because the test suite imports `main` from
`index.ts` and must not trigger `runMain` as a side
effect of importing. The bin file calls `runMain`
unconditionally; the library file only exports
`main`.

## Root CLI invocation

`pnpm cli` runs
`node --env-file-if-exists=.env ./apps/cli/dist/bin.mjs`
directly — no bin symlink, no root devDep on the
app. The `dist/bin.mjs` file exists from the
`prepare` lifecycle (`cross-test -s … || obuild
--stub`) so it's available immediately after
`pnpm install`. The `--env-file-if-exists` flag
loads `<repo-root>/.env` (gitignored) when present
so `CLOUDFLARE_API_TOKEN` can live there for local
dev; direct `node` invocations skip it on purpose
so scripted callers stay explicit about their env.

`bin.ts` installs an EPIPE swallower on
`process.stdout` so a downstream consumer closing
the pipe early (`pnpm cli zones list | head -3`)
exits cleanly instead of crashing with an
unhandled `'error'` event.

## CLI output conventions

Commands split their writes between two streams:

- **Data rows** go to `process.stdout.write`
  directly — one row per line, machine-consumable.
- **Everything else** (info, warnings, errors,
  progress) goes through `consola`. Use
  `consola.warn` for non-data lines that should
  land on stderr — `consola.info` routes through
  the default reporter to **stdout** and would
  pollute a piped consumer.

Every error path goes through `fatal(message)`
from `src/exit.ts`, which logs via `consola.fatal`
and sets `process.exitCode = 1` before returning.
`runMain` propagates the exit code naturally —
the single-function seam is where to change
strategy if citty's natural-exit behaviour ever
changes.

Commands wrap their work in `withClient` from
`src/lifecycle.ts` — it resolves credentials,
hands them a `Client` (from `src/cf/client.ts`),
and reports `AuthError` / `APIError` failures
consistently with `process.exitCode = 1`.

`Client` abstracts CF's API and state; it does
not know about the app's auth pipeline, logging,
or exit-code conventions — that's `lifecycle.ts`'s
job, which lives outside `cf/` for that reason.
New CF resource methods land on `Client`, giving
a single seam for caching, retries, or request
shaping later — but **not** logging: `Client`
stays agnostic of how it's invoked. Logging is the
consumer's job (see `fatal()` in `src/exit.ts`).
Never construct `new Cloudflare(...)` inline.

See the README's "Scripting the CLI" section for
the consumer side of this contract (including the
`pnpm cli` banner caveat).

## Headless runtime

The CLI runs in environments with no desktop —
CI, SSH sessions, containers, Claude Code's
runtime. Don't spawn browsers (no `xdg-open`,
`open`, or shell-out to a launcher).

When a flow needs the user to obtain something
through a browser (e.g., minting a CF API token),
print the URL and `consola.prompt` for the paste
back. Same UX shape as OAuth device flow, minus
the protocol.

## obuild stubbing

`packages/dispatcher` and `apps/cli` build with
`obuild`. The npm `prepare` lifecycle runs
`cross-test -s dist/<entry>.mjs || obuild --stub` so
every install — including the dispatcher being
consumed as a workspace dep — gets re-export stubs
without needing a full build.

## Dispatch modes (planned)

Once matching lands, the dispatcher resolves a
matched route to one of four modes:

- **Direct handler** — logic lives in the dispatcher
  worker itself; shared API endpoints that don't
  warrant a separate worker.
- **Static service binding** — forward to a known
  sibling worker declared in `wrangler.toml` via
  `env.<BINDING>.fetch(request)`.
- **Dispatch namespace lookup** — forward to a
  tenant worker resolved by name at runtime via
  `env.<NS>.get(name).fetch(request)`. Needs
  Cloudflare's Workers for Platforms (paid tier,
  not yet enabled on the Apptly account); the
  appeal is that tenant workers can be added or
  removed through the API without redeploying the
  dispatcher.
- **Reverse proxy** — fetch from a remote origin
  URL.

## Scaffold state

The dispatcher exports the API surface but falls
through to `notFound` for every request;
matcher-driven routing lands later. The worker
demonstrates the API with a banner `notFound` and
no routes. The CLI carries `whoami` (auth pipeline)
and `zones list` / `zones get` (read-only
Cloudflare zone lookups) so far. Both default to
plain space-separated fields per line and accept
`--json` to switch the data stream to one JSON
envelope per record (NDJSON for `list`, a single
envelope for `get`) — pick whichever scripting
target, `awk`/`cut` or `jq`, suits the consumer.
