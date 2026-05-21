# @apptly/sass-dispatcher

Routing primitives shared by
`@apptly/sass-dispatcher-worker` and
`@apptly/sass-dispatcher-cli`.

## Exports

- `newDispatcher(config)` — builds an
  `ExportedHandlerFetchHandler<E>` that dispatches by
  `URL.hostname`. Each configured host gets an itty
  router built at config time; the matching host's
  rules are tried in order. Known hosts whose rule
  chain declines (including the spec-protected
  `/.well-known/taistamp/*` arm) fall through to
  `config.notFound`; unknown hostnames fall through
  to `config.fallback` (which itself defaults to
  `notFound`). Both default to 404 `text/plain`.
  Hostname matching is exact — `taistamp.org` does
  not match `www.taistamp.org`.
- `newHandlerStore(builder)` — per-isolate memoising
  store. Binds a builder + optional options type `T`
  to a `Map<K, Promise<Handler<E>>>` and returns a
  synchronous factory `(key, options?) => Handler<E>`
  whose handlers transparently await the cached
  build on first request.
- `newKeyedHandlerStore(builder, toKey)` — sibling of
  `newHandlerStore` for cases where the natural input
  isn't a sensible `Map` key (object identity, equal-
  content distinct objects). Returns a factory
  `(input: T) => Handler<E>`; the cache is keyed by
  `toKey(input)`. The builder receives both the
  derived key and the input.
- `newSingleton(builder)` — lower-level memoisation
  primitive that both `newHandlerStore` and
  `newKeyedHandlerStore` build on. Caches an async
  build per-key; concurrent callers share the
  in-flight promise; rejections evict. Use directly
  when you need per-key memoisation but not the
  dispatcher's `Handler` shape.
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
- `KeyedHandlerBuilder<T, K, E>` — `(key, input: T,
  env?: E) => Handler<E> | Promise<Handler<E>>`.
  Sibling of `HandlerBuilder` with required `input`;
  consumed by `newKeyedHandlerStore`. `K` defaults to
  `string`.
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
  notFound?: Handler<E>; fallback?: Handler<E> }`.
  `notFound` is the configured 404 for known hosts
  whose rules all decline (and for the taistamp `/*`
  arm); `fallback` is the catch-all for hostnames
  not in `hosts` and defaults to `notFound`.

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

## `newKeyedHandlerStore` in use

```ts
import {
  type Handler,
  newKeyedHandlerStore,
} from '@apptly/sass-dispatcher';

interface Target {
  readonly host: string
  readonly path: string
}

const buildTargetHandler = (
  _key: string,
  target: Target,
): Handler =>
  (request) =>
    new Response(`routed to ${target.host}${target.path}`);

const serialiseTarget = (target: Target): string =>
  `${target.host}|${target.path}`;

const handlerFor = newKeyedHandlerStore(
  buildTargetHandler,
  serialiseTarget,
);

export default {
  async fetch(request) {
    const target: Target = { host: 'upstream.test', path: '/' };
    return handlerFor(target)(request);
  },
};
```

The factory `(input: T) => Handler<E>` takes the
natural input; the derived key is opaque to callers.
`toKey` runs on every invocation (cheap, pure); the
build runs on cache miss. Two equal-content distinct
inputs share one build because their derived keys
collide.

Once a key is cached, later calls with a different
`input` reuse the originally-built handler — the
input bound to the cached build is the one from the
first call. If a build-affecting field isn't in the
key, distinct-input/same-key callers reuse the wrong
handler; ensure every field the builder reads
contributes to `toKey`.

## `newSingleton` in use

```ts
import { newSingleton } from '@apptly/sass-dispatcher';

const tokenFor = newSingleton<string, string>(
  async (org) => {
    const response = await fetch(
      `https://api.example/orgs/${org}/token`,
    );
    return response.text();
  },
);

// First call per `org` triggers the async build;
// concurrent callers share the in-flight promise.
// Later calls per the same `org` reuse the cached
// token.
const token = await tokenFor('apptly');
```

Trailing args pass through to the builder on the first
call and are ignored on cache hits, so the args from
whichever caller triggered the build bind into the
cached value:

```ts
const labelFor = newSingleton<string, string, [string]>(
  (key, suffix) => `${key}:${suffix}`,
);

await labelFor('a', 'one'); // 'a:one'
await labelFor('a', 'two'); // 'a:one' — first call wins
```

Rejection semantics match `newHandlerStore`: a rejected
build is evicted so the next call retries; the cache has
no eviction beyond that, so keys should be a bounded
set.
