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
