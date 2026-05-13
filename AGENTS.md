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

`pnpm cli` runs `node ./apps/cli/dist/bin.mjs`
directly — no bin symlink, no root devDep on the
app. The `dist/bin.mjs` file exists from the
`prepare` lifecycle (`cross-test -s … || obuild
--stub`) so it's available immediately after
`pnpm install`.

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

The dispatcher currently exports the API surface but
falls through to `notFound` for every request;
matcher-driven routing lands later. The worker
demonstrates the API by configuring a banner
`notFound` and no routes. The CLI prints a stub
banner with no subcommands.
