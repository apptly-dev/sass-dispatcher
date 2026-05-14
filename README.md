# sass-dispatcher

Apptly SaaS dispatcher monorepo. The Cloudflare
Worker bound to `apptly.me` (APEX), acting as the
Cloudflare-for-SaaS fallback for tenant custom
hostnames; plus its routing library and admin CLI.

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

## Scripting the CLI

Scriptable commands like `zones list`,
`hostnames list <zone>`, and `fallback get <zone>`
write data rows directly to stdout, one row per line;
warnings and errors go to stderr. The default row
shape is space-separated fields, safe for piping into
`awk`, `xargs`, `cut`, etc. Pass `--json` to switch
the data stream to one JSON envelope per record
(NDJSON for `list`, a single envelope for `get`) when
you want richer fields under `jq`.

`zones get <zone>` is the aggregated diagnostic view —
it prints labelled sections covering zone metadata,
custom hostnames, and the SaaS fallback origin. Under
`--json` it emits a single composite envelope
(`{ zone, hostnames, fallback }`).

When invoked as `pnpm cli`, pnpm itself prints a three-line
script banner (the `> @apptly/...` headers and a blank
line) to stdout before forwarding the command output. To
get a clean stdout for scripting, pass `--silent` to pnpm:

```sh
pnpm --silent cli zones list | wc -l   # exact zone count
pnpm --silent cli hostnames list apptly.me --json | jq -r '.hostname'
pnpm --silent cli zones get apptly.me --json | jq -r '.hostnames[].hostname'
```

Calling the built binary directly
(`node ./apps/cli/dist/bin.mjs zones list`) is clean
without any flag.
