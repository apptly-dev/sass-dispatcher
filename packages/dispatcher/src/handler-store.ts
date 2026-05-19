/**
 * Memoising store for per-isolate caching of built
 * fetch handlers keyed by their build input.
 */

import type { Handler } from './types';

/**
 * Builder consumed by {@link newHandlerStore}. Receives
 * the cache key, optional caller-supplied options, and
 * the request-time `env` of the first build; may resolve
 * synchronously or asynchronously.
 *
 * `env` is supplied for build-time access to isolate-
 * stable handles (service bindings, dispatch namespaces,
 * KV/D1 bindings). The builder runs once per key, so it
 * sees only the first request's env — safe on workers
 * because env is per-isolate stable, but do not close
 * over fetch-time inputs like `context`.
 */
export type HandlerBuilder<T, K = string | undefined, E = unknown> = (
  key: K,
  options?: T,
  env?: E,
) => Handler<E> | Promise<Handler<E>>;

/**
 * Bind a {@link HandlerBuilder} to a per-isolate cache,
 * returning a synchronous factory `(key, options?)` that
 * yields a {@link Handler}. The handler awaits the
 * cached build promise on first request, then reuses the
 * resolved value, so the builder runs at most once per
 * (key) per isolate.
 *
 * Options are read at first build only — once a key's
 * handler is cached, later calls with different options
 * for the same key reuse the original build. Use a
 * distinct key per options variant.
 *
 * A rejected build is evicted from the cache so the
 * next call retries; callers already awaiting the
 * failed build still see the rejection.
 *
 * The cache has no eviction beyond rejection — keys
 * should be a bounded set (secrets, bindings) rather
 * than per-request data.
 *
 * The key type defaults to `string | undefined` so a
 * builder whose key may legitimately be absent flows in
 * unmolested. E defaults to `unknown` for builders that
 * absorb their env-derived inputs into the key and
 * ignore env/context at invocation.
 */
export const newHandlerStore = <T, K = string | undefined, E = unknown>(
  builder: HandlerBuilder<T, K, E>,
): (key: K, options?: T) => Handler<E> => {
  const cache = new Map<K, Promise<Handler<E>>>();
  return (key: K, options?: T): Handler<E> =>
    async (request, env, context) => {
      let pending = cache.get(key);
      if (pending === undefined) {
        pending = Promise.resolve(builder(key, options, env)).catch((error: unknown) => {
          cache.delete(key);
          throw error;
        });
        cache.set(key, pending);
      }
      const handler = await pending;
      return handler(request, env, context);
    };
};
