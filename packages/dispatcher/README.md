# @apptly/sass-dispatcher

Routing primitives shared by
`@apptly/sass-dispatcher-worker` and
`@apptly/sass-dispatcher-cli`.

## Exports

- `newDispatcher(config)` — request resolver
  scaffold. Falls back to the configured `notFound`
  (default `404`); matcher-driven routing lands as
  the dispatcher firms up.
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
