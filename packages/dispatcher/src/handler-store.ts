/**
 * Memoising store for per-isolate caching of built
 * request handlers keyed by their build input.
 */

/**
 * Request handler whose env-derived inputs were
 * absorbed at build time by the builder closure.
 * Distinct from a fetch handler that receives env
 * and context per-request.
 */
export type Handler = (request: Request) => Promise<Response> | Response;

/**
 * Builder consumed by {@link newHandlerStore}. Receives
 * the cache key and optional caller-supplied options;
 * may resolve synchronously or asynchronously.
 */
export type HandlerBuilder<T, K = string | undefined> = (
  key: K,
  options?: T,
) => Handler | Promise<Handler>;

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
 * unmolested.
 */
export const newHandlerStore = <T, K = string | undefined>(
  builder: HandlerBuilder<T, K>,
): (key: K, options?: T) => Handler => {
  const cache = new Map<K, Promise<Handler>>();
  return (key: K, options?: T): Handler => async (request) => {
    let pending = cache.get(key);
    if (pending === undefined) {
      pending = Promise.resolve(builder(key, options)).catch((error: unknown) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
    }
    const handler = await pending;
    return handler(request);
  };
};
