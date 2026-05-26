# @apptly/sass-dispatcher

Routing primitives shared by
`@apptly/sass-dispatcher-worker` and
`@apptly/sass-dispatcher-cli`.

## Exports

- `newDispatcher(config)` — builds an
  `ExportedHandlerFetchHandler<E>` that dispatches by
  `URL.hostname`. Each configured host gets an itty
  router built at config time; the matching host's
  rules are tried in order. Unknown hosts and no-match
  paths fall through to `config.notFound` (default
  404 `text/plain`). Hostname matching is exact —
  `taistamp.org` does not match `www.taistamp.org`.
- `newHandlerStore(builder)` — per-isolate memoising
  store. Binds a builder + optional options type `T`
  to a `Map<K, Promise<Handler<E>>>` and returns a
  synchronous factory `(key, options?) => Handler<E>`
  whose handlers transparently await the cached
  build on first request.
- `Handler<E>` — `(request: Request<unknown,
  IncomingRequestCfProperties>, env?: E, context?:
  ExecutionContext) => Promise<Response> | Response`.
  The unified dispatch-target shape; the request type
  matches Cloudflare's incoming request so handlers
  can read `request.cf` without casts. `env` and
  `context` are optional because handlers built
  through `newHandlerStore` typically absorb
  env-derived inputs at build time and ignore the
  fetch-time pair, so an implementation can drop them
  entirely (`() => Response` is a valid `Handler`).
  The dispatcher narrows itty's broader `IRequest` to
  this shape via the router's generic parameter.
- `HandlerBuilder<T, K, E>` — `(key, options?, env?:
  E) => Handler<E> | Promise<Handler<E>>`. `K`
  defaults to `string | undefined` so bindings whose
  value may legitimately be absent flow in
  unmolested; `E` defaults to `unknown` for builders
  that ignore env at build time.
- `Rule<E>` — discriminated union of the rule
  variants below: `HandlerOptions<E> |
  RedirectOptions<E> | ServiceOptions<E> |
  TaistampOptions<E>`.
- `HandlerOptions<E>` — handler-rule variant
  (see below).
- `RedirectOptions<E>` — redirect-rule variant
  (see below).
- `ServiceOptions<E>` — service-rule variant
  (see below).
- `TaistampOptions<E>` — taistamp-rule variant
  (see below).
- `RedirectCode` — `301 | 302 | 303 | 307 | 308`,
  the 30x family minus 300 (no `Location`), 304
  (conditional), 305 (deprecated) and 306
  (reserved).
- `ValueOrAccessor<T, E>` — `((env: E) => T) | T`.
  Used for rule fields whose value can be supplied
  as a literal or an env-time resolver; unwrapping is
  per-matched-request. Not usable on fields whose
  static type is itself a function.
- `HostRules<E>` — `Record<string, Rule<E> | readonly
  Rule<E>[]>`. Per host: either a single rule or an
  ordered array.
- `HostRouter<E>` — alias for the itty router shape
  used by `newDispatcher` internally. Exported so
  callers building their own router can type the
  variable.
- `DispatcherConfig<E>` — `{ hosts?: HostRules<E>;
  notFound? }`.

## Rule variants

Per-host rule arrays are tried in order — first match
wins. Each entry is a `Rule<E>`:

- `HandlerOptions<E>` — `{ handler, match? }`.
  Escape hatch: mounts a caller-supplied `Handler<E>`
  directly on any path matching `match` (an itty
  path pattern, default `/*`). For behaviour none of
  the other variants cover.
- `RedirectOptions<E>` — `{ redirectTo, redirectCode,
  match? }`. Static redirect; `redirectTo` is a
  literal string or an env-time accessor
  `(env) => string` (via `ValueOrAccessor`); sent
  verbatim (no `:param` substitution from `match`
  yet). `redirectCode` is narrowed to `RedirectCode`.
  `match` is an itty path pattern and defaults to
  `/*` so a host-wide redirect can omit it.
- `ServiceOptions<E>` — `{ service, match? }`.
  Delegates any path matching `match` (default `/*`)
  to a Cloudflare service binding by calling
  `binding.fetch(request)`. `service` is a literal
  `Fetcher` or an env-time accessor
  `(env) => Fetcher` (via `ValueOrAccessor`).
- `TaistampOptions<E>` — `{ taistamp }`. Claims
  `/.well-known/taistamp` on the owning host and
  404s anything under that prefix. `taistamp` is a
  literal string or an env-time accessor
  `(env) => string` (via `ValueOrAccessor`) packing
  one or more `selector:base64` secrets separated by
  whitespace, commas, semicolons, pipes, or any
  character outside the `selector:base64` alphabet.
  The last entry signs; leading entries are reserved
  for rotation. Empty, undefined, or delimiter-only
  input serves unsigned; a malformed entry rejects
  (strict mode). The lib never names a specific env
  field. The taistamp draft pins the request URI to
  the exact path, so no `match` override.

Rules whose shape matches none of the above
`console.warn` (naming the offending host) and are
skipped at construction — reachable only via
type-system bypass (cast, JSON import, etc.).

## `./taistamp` subpath

The taistamp building blocks are also exposed at
`@apptly/sass-dispatcher/taistamp` for callers using
the cached handler directly without `newDispatcher`:

- `taistampHandler(secrets)` — per-isolate cached
  `Handler` factory; pass the parsed secret string
  (or `undefined` / `''` for the unsigned
  handler). See `newHandlerStore` semantics below.
- `TAISTAMP_PATH` — re-exported from
  `@kagal/taistamp`; the well-known path the
  taistamp draft pins.
- `Handler` — also re-exported from the main
  entry; available here so subpath-only callers
  don't need both imports.

## `newDispatcher` in use

```ts
import { newDispatcher } from '@apptly/sass-dispatcher';

interface Env {
  readonly TAISTAMP_SECRETS?: string;
}

export default {
  fetch: newDispatcher<Env>({
    hosts: {
      'taistamp.example': [
        { taistamp: (env) => env.TAISTAMP_SECRETS ?? '' },
      ],
      'legacy.example': [
        {
          redirectTo: 'https://new.example/',
          redirectCode: 301,
        },
      ],
    },
  }),
};
```

## `newHandlerStore` in use

```ts
import {
  type Handler,
  newHandlerStore,
} from '@apptly/sass-dispatcher';

const buildHandler = async (
  key: string | undefined,
): Promise<Handler> => {
  // expensive async setup keyed by `key` — runs at
  // most once per distinct key per isolate.
  return (request) =>
    new Response(`hello ${key ?? 'anon'}`);
};

const handlerFor = newHandlerStore(buildHandler);

export default {
  async fetch(request, env) {
    // The factory is synchronous; the returned
    // `Handler` awaits the cached build on first
    // invocation.
    const handler = handlerFor(env.SOME_BINDING);
    return handler(request);
  },
};
```

Distinct keys cache separately; `undefined` is an
accepted key. Concurrent requests with the same key
during the first build share one in-flight
`Promise<Handler>`, so the builder runs at most
once.

Each factory call returns a new outer `Handler`
closure even when the underlying build is cached;
cache the `Handler` at registration time (or on
first request per isolate) rather than calling
`handlerFor(...)` on every request.

Options are read at first build only — once a key's
handler is cached, later calls with different options
for the same key reuse the original build. Use a
distinct key per options variant.

A rejected build is evicted from the cache; the next
call retries. The cache has no eviction beyond that,
so keys should be a bounded set (secrets, bindings)
rather than per-request data.
