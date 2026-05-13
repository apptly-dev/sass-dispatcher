/**
 * Handler signature shared by every dispatcher route.
 * Mirrors a Web `fetch` handler so a route can be
 * plugged straight into a Cloudflare Worker.
 */
export type RouteHandler<TEnv = unknown, TContext = unknown> = (
  request: Request,
  env: TEnv,
  context: TContext,
) => Promise<Response> | Response;

/**
 * A single dispatch rule. The scaffold exposes only
 * the handler; matcher fields (host, path, method)
 * land alongside the matching implementation.
 */
export interface Route<TEnv = unknown, TContext = unknown> {
  readonly handler: RouteHandler<TEnv, TContext>
}

/**
 * Configuration accepted by {@link newDispatcher}.
 */
export interface DispatcherConfig<TEnv = unknown, TContext = unknown> {
  readonly notFound?: RouteHandler<TEnv, TContext>
  readonly routes: readonly Route<TEnv, TContext>[]
}
