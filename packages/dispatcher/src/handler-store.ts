/**
 * Per-isolate memoisation primitives. {@link newSingleton}
 * is the abstract builder cache; {@link newHandlerStore}
 * and {@link newKeyedHandlerStore} adapt it for the
 * dispatcher's {@link Handler} shape.
 */

import type { Handler } from './types';

/**
 * Memoise a build keyed by `key`. The builder runs at
 * most once per distinct key per isolate; concurrent
 * callers share the in-flight promise.
 *
 * A rejected build is evicted so the next call retries;
 * callers already awaiting the failed build still see
 * the rejection. There is no eviction beyond that — keys
 * should be a bounded set.
 *
 * Trailing args are passed to the builder on the first
 * call (and on retries after a rejection); later callers
 * reuse the cached promise regardless of what they pass.
 * The args from whichever caller triggered the build
 * therefore bind into the cached value, while still
 * letting every caller parameterise the build site.
 *
 * See {@link newHandlerStore} and
 * {@link newKeyedHandlerStore} for the dispatcher's
 * Handler-shaped adapters built on this primitive.
 */
export const newSingleton = <K, V, Extra extends readonly unknown[] = []>(
  builder: (key: K, ...extra: Extra) => Promise<V> | V,
): ((key: K, ...extra: Extra) => Promise<V>) => {
  const cache = new Map<K, Promise<V>>();
  return async (key, ...extra): Promise<V> => {
    let pending = cache.get(key);
    if (pending === undefined) {
      pending = Promise.resolve(builder(key, ...extra)).catch((error: unknown) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
    }
    return pending;
  };
};

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
 * cached build promise on first request, then reuses
 * the resolved value.
 *
 * Cache semantics match {@link newSingleton}: the
 * builder runs at most once per key per isolate,
 * rejections evict, no eviction beyond that — keys
 * should be a bounded set (secrets, bindings) rather
 * than per-request data.
 *
 * Options are read at first build only — once a key's
 * handler is cached, later calls with different options
 * for the same key reuse the original build. Use a
 * distinct key per options variant.
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
  const get = newSingleton<K, Handler<E>, [T | undefined, E | undefined]>(builder);
  return (key: K, options?: T): Handler<E> =>
    async (request, env, context) => {
      const handler = await get(key, options, env);
      return handler(request, env, context);
    };
};

/**
 * Builder consumed by {@link newKeyedHandlerStore}.
 * Takes the natural `input: T` (always supplied by the
 * factory) and optionally the request `env`. The
 * derived cache key is not passed in — call `toKey`
 * inside if you need the canonicalised form.
 *
 * `env` is supplied for build-time access to isolate-
 * stable handles (service bindings, dispatch namespaces,
 * KV/D1 bindings). The builder runs once per derived
 * key, so it sees only the first request's env — safe
 * on workers because env is per-isolate stable, but do
 * not close over fetch-time inputs like `context`.
 */
export type KeyedHandlerBuilder<T, E = unknown> = (
  input: T,
  env?: E,
) => Handler<E> | Promise<Handler<E>>;

/**
 * Bind a {@link KeyedHandlerBuilder} to a per-isolate
 * cache keyed by `toKey(input)`. The returned factory
 * `(input: T) => Handler<E>` takes the natural input
 * type; the derived key is opaque to callers.
 *
 * For cases where the natural input isn't a sensible
 * `Map` key — object identity, equal-content distinct
 * objects, or any composite that needs serialising to
 * collapse. Where the input already is the key, use
 * {@link newHandlerStore} directly.
 *
 * Cache semantics match {@link newSingleton}: the
 * builder runs at most once per distinct derived key
 * per isolate, rejections evict, no eviction beyond
 * that. `toKey` runs on every factory invocation
 * (cheap, pure), the build runs on cache miss.
 */
export const newKeyedHandlerStore = <T, K = string, E = unknown>(
  builder: KeyedHandlerBuilder<T, E>,
  toKey: (input: T) => K,
): ((input: T) => Handler<E>) => {
  const get = newSingleton<K, Handler<E>, [T, E | undefined]>(
    (_key, input, env) => builder(input, env),
  );
  return (input: T): Handler<E> =>
    async (request, env, context) => {
      const handler = await get(toKey(input), input, env);
      return handler(request, env, context);
    };
};
