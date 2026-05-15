<!-- cspell:words originless -->
# sass-dispatcher

Apptly SaaS dispatcher monorepo. The Cloudflare
Worker bound to the `apptly.me` SaaS zone via a
`*/*` Worker Route, fielding every tenant custom
hostname forwarded through Cloudflare-for-SaaS; plus
its routing library and admin CLI.

## Layout

- `packages/dispatcher` — `@apptly/sass-dispatcher`,
  the routing primitive shared by the worker and the
  CLI.
- `apps/worker` — `@apptly/sass-dispatcher-worker`,
  the deployed Cloudflare Worker entry.
- `apps/cli` — `@apptly/sass-dispatcher-cli`, the
  `sass-dispatcher` admin shell.

## Prerequisites

- Node 24+ (see `.node-version`)
- pnpm 10.33+

## Quickstart

```sh
pnpm install
pnpm precommit      # lint + type-check + build + test
```

## Common tasks

- `pnpm dev` — run the worker locally via Wrangler.
- `pnpm cli` — invoke the admin CLI.
- `pnpm build` — build all packages.
- `pnpm test` — run every vitest suite.
- `pnpm cf:deploy` — `wrangler deploy` every package with a
  `cf:deploy` script (currently just the worker).
- `pnpm cf:preview` — `wrangler versions upload` for every
  package with a `cf:preview` script; uploads a new version
  without activating it and prints a preview URL.

## Local credentials

`pnpm cli` loads `<repo-root>/.env` via Node's
`--env-file-if-exists` flag when present. The file is
gitignored — drop `CLOUDFLARE_API_TOKEN=…` in there to
avoid touching wrangler/exporting in every shell. Direct
invocation (`node ./apps/cli/dist/bin.mjs`) doesn't read
`.env` — that's deliberate, so scripted use stays explicit
about its environment.

Account-scoped operations (`bindings list` for Worker
Custom Domains, eventually dispatch namespaces) also need
`CLOUDFLARE_ACCOUNT_ID=…` in the same file. Auto-detection
will land later; today the env var is the only source, and
those operations skip with a warning when it's unset.

## Cloudflare-for-SaaS setup

Two zone-level prerequisites turn a SaaS zone into the
fallback target for tenant custom hostnames, per
Cloudflare's [`worker-as-origin` guide][cf-was]:

1. **Originless fallback-origin DNS record.** Add a
   placeholder DNS record matching the configured
   fallback-origin hostname (set under SaaS →
   Configuration → Fallback Origin in the dashboard).
   An AAAA pointing to `100::`, proxied through
   Cloudflare, is the canonical placeholder — the
   public answer is CF anycast, the record never
   actually serves traffic (the Worker Route catches
   first), but it must resolve or CF SaaS rejects the
   request with HTTP 530.
2. **`*/*` Worker Route on the zone, bound to
   `sass-dispatcher`.** This is what catches tenant
   traffic. The CF SaaS edge forwards
   `Host: tenant.example` requests into the zone; the
   `*/*` route matches before the origin fetch and the
   worker fires with the tenant hostname intact.
   Without this route, CF tries to fetch the
   originless placeholder as a real origin and returns
   HTTP 522.

A Worker Custom Domain on the apex is **not** what
catches SaaS-fallback traffic — Custom Domains are
hostname-specific bindings. The `*/*` route handles
direct apex traffic too, so a Custom Domain is
redundant once the route is in place.

Verify the zone with `pnpm cli zones get <zone>` once
both prerequisites are in place: the `fallback:` line
should show the configured hostname `active`, the
bindings section should list a `*/*` route bound to
`sass-dispatcher`, and `pnpm cli dns <fallback-host>
--type AAAA` should return CF anycast addresses.

## Scripting the CLI

Scriptable commands like `zones list`,
`hostnames list <zone>`, `fallback get <zone>`,
`bindings list <zone>`, and `dns <name>` write data
rows directly to stdout, one row per line; warnings
and errors go to stderr. The default row shape is space-separated
fields, safe for piping into `awk`, `xargs`, `cut`,
etc. Pass `--json` to switch the data stream to one
JSON envelope per record (NDJSON for `list`, a single
envelope for `get`) when you want richer fields under
`jq`.

`zones get <zone>` is the aggregated diagnostic view —
it prints labelled sections covering zone metadata,
custom hostnames, the SaaS fallback origin, and the
Worker bindings (routes + Custom Domains) attached to
the zone. Under `--json` it emits a single composite
envelope (`{ zone, hostnames, fallback, bindings }`).

`bindings list <zone>` covers the worker layer one
zone at a time:

```text
route  <id> <pattern>  <script>
domain <id> <hostname> <service>
```

Each row's first field tags the kind:

- **Worker Route** — Host/path pattern match. `*/*`
  catches everything entering the zone, including
  Cloudflare-for-SaaS fallback traffic for tenant
  custom hostnames (see
  [setup](#cloudflare-for-saas-setup)).
- **Worker Custom Domain** — hostname-specific binding
  for direct traffic to that one hostname; does not
  catch SaaS-fallback traffic.

Worker Custom Domains is account-scoped, so
`CLOUDFLARE_ACCOUNT_ID` must be set or the domains
half is skipped with a stderr warning.

`dns <name>` queries Cloudflare's public DoH
endpoint (`cloudflare-dns.com/dns-query`)
anonymously — no `CLOUDFLARE_API_TOKEN` needed.
`--type` selects the record type (default `A`); rows
are `<name> <TTL> <type> <data>`. Useful for
confirming the originless fallback record resolves
(see [setup](#cloudflare-for-saas-setup)) and for
tenant-hostname CNAME-chain checks when `dig`/`host`
aren't on the machine.

When invoked as `pnpm cli`, pnpm itself prints a three-line
script banner (the `> @apptly/...` headers and a blank
line) to stdout before forwarding the command output. To
get a clean stdout for scripting, pass `--silent` to pnpm:

```sh
pnpm --silent cli zones list | wc -l   # exact zone count
pnpm --silent cli hostnames list apptly.me --json | jq -r '.hostname'
pnpm --silent cli zones get apptly.me --json | jq -r '.hostnames[].hostname'
pnpm --silent cli bindings list apptly.me --json | jq -r 'select(.kind=="domain").hostname'
pnpm --silent cli dns apptly.me --type AAAA
```

Calling the built binary directly
(`node ./apps/cli/dist/bin.mjs zones list`) is clean
without any flag.

[cf-was]: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
