import type {
  DispatcherConfig,
  RouteHandler,
} from './types';

const defaultNotFound: RouteHandler = () =>
  new Response('Not Found', { status: 404 });

/**
 * Build a dispatcher that resolves a request to a
 * {@link RouteHandler}. The scaffold returns the
 * configured `notFound` (default: 404) for every
 * request; matcher-driven routing lands as the
 * dispatcher firms up.
 */
export const newDispatcher = <TEnv, TContext>(
  config: DispatcherConfig<TEnv, TContext>,
): RouteHandler<TEnv, TContext> =>
  config.notFound ??
  (defaultNotFound as RouteHandler<TEnv, TContext>);
