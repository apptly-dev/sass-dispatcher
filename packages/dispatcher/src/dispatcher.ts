import { IttyRouter } from 'itty-router';

import type {
  CfRequest,
  DispatcherConfig,
  Handler,
  HostRouter,
  RedirectOptions,
  Rule,
} from './types';
import { mountTaistampHandler } from './taistamp';
import { getValue } from './value';

const defaultNotFound: Handler = () =>
  new Response('Not Found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

const mountRedirectHandler = <E>(
  router: HostRouter<E>,
  options: RedirectOptions<E>,
): void => {
  // Static status-code redirect; `redirectTo` sent
  // verbatim (no `:param` substitution). `match`
  // defaults to `/*` so a host-wide redirect can
  // omit the path pattern.
  router.all(options.match ?? '/*', (_request, env) =>
    new Response(undefined, {
      status: options.redirectCode,
      headers: { Location: getValue(options.redirectTo, env) },
    }));
};

const buildHostRouter = <E>(
  host: string,
  rules: readonly Rule<E>[] | Rule<E>,
): HostRouter<E> => {
  const router: HostRouter<E> = IttyRouter<
    CfRequest,
    [E, ExecutionContext],
    Response | undefined
  >();

  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    if ('taistamp' in rule) {
      // /.well-known/taistamp + sibling 404.
      mountTaistampHandler(router, rule);
    } else if ('redirectTo' in rule) {
      // host- or path-scoped redirect.
      mountRedirectHandler(router, rule);
    } else {
      // Reachable only if the type system was bypassed
      // (cast, JSON import, etc.); log + skip rather
      // than crash at construction.
      console.warn(
        `[sass-dispatcher] ${host}: rule has no recognised ` +
        'discriminant (redirectTo/taistamp), skipping:',
        rule,
      );
    }
  }
  return router;
};

/**
 * Build a fetch handler that dispatches by hostname
 * and per-host rule list. For each request the
 * matching host's rules are tried in order via an
 * itty router; if no rule matches (or the host is
 * unknown), the request falls through to
 * `config.notFound` (default: 404 text/plain).
 *
 * Hostname matching is exact — `taistamp.org` does
 * not match `www.taistamp.org`. Add each form as its
 * own key if both should dispatch.
 */
export const newDispatcher = <E>(
  config: DispatcherConfig<E> = {},
): ExportedHandlerFetchHandler<E> => {
  const notFound: Handler<E> = config.notFound ?? defaultNotFound;
  const routers = new Map(
    Object.entries(config.hosts ?? {}).map(
      ([host, rules]) => [host, buildHostRouter(host, rules)] as const,
    ),
  );

  return async (request, env, context) => {
    const u = new URL(request.url);
    const router = routers.get(u.hostname);
    const response: Response | undefined = router ?
      await router.fetch(request, env, context) :
      undefined;
    return response ?? notFound(request, env, context);
  };
};
