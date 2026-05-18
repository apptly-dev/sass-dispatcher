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
  to a `Map<K, Promise<Handler>>` and returns a
  synchronous factory `(key, options?) => Handler`
  whose handlers transparently await the cached
  build on first request.
- `Handler` — `(request: Request) => Promise<Response>
  | Response`. Request handler whose env-derived
  inputs were absorbed at build time by the builder
  closure; distinct from `RouteHandler`, which
  receives env per-request.
- `HandlerBuilder<T, K>` — `(key, options?) => Handler
  | Promise<Handler>`. `K` defaults to `string |
  undefined` so bindings whose value may legitimately
  be absent flow in unmolested.
- `Rule<E>` — discriminated union of the rule
  variants below: `RedirectOptions |
  TaistampOptions<E>`.
- `RedirectOptions` — redirect-rule variant
  (see below).
- `TaistampOptions<E>` — taistamp-rule variant
  (see below).
- `RedirectCode` — `301 | 302 | 303 | 307 | 308`,
  the 30x family minus 300 (no `Location`), 304
  (conditional), 305 (deprecated) and 306
  (reserved).
- `HostRules<E>` — `Record<string, readonly Rule<E>[]>`.
  Per-host rule arrays, keyed by hostname.
- `HostRouter<E>` — alias for the itty router shape
  used by `newDispatcher` internally and by mounter
  helpers like `mountTaistampHandler` (see the
  `./taistamp` subpath below). Exported so callers
  building their own router can type the variable.
- `DispatcherConfig<E>` — `{ hosts?: HostRules<E>;
  notFound? }`.

## Rule variants

Per-host rule arrays are tried in order — first match
wins. Each entry is a `Rule<E>`:

- `RedirectOptions` — `{ redirectTo, redirectCode,
  match? }`. Static redirect; `redirectTo` is sent
  verbatim (no `:param` substitution from `match`
  yet). `redirectCode` is narrowed to `RedirectCode`.
  `match` is an itty path pattern and defaults to
  `/*` so a host-wide redirect can omit it.
- `TaistampOptions<E>` — `{ taistamp }`. Claims
  `/.well-known/taistamp` on the owning host and
  404s anything under that prefix. `taistamp` is
  `(env: E) => string`, pulling the secret out of
  the caller's env. The taistamp draft pins the
  request URI to the exact path, so no `match`
  override.

Rules whose shape matches none of the above
`console.warn` (naming the offending host) and are
skipped at construction — reachable only via
type-system bypass (cast, JSON import, etc.).

## `./taistamp` subpath

The taistamp variant's building blocks are also
exposed at `@apptly/sass-dispatcher/taistamp` for
callers mounting on their own router or using the
cached handler directly without `newDispatcher`:

- `mountTaistampHandler(router, options)` —
  registers `/.well-known/taistamp` + the sibling
  404 on the given `HostRouter<E>`. The same
  wiring `newDispatcher` does internally for a
  `TaistampOptions<E>` rule.
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
  readonly TAISTAMP_SECRET: string;
}

export default {
  fetch: newDispatcher<Env>({
    hosts: {
      'taistamp.example': [
        { taistamp: (env) => env.TAISTAMP_SECRET },
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
