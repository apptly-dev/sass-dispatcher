import { IttyRouter } from 'itty-router';

import type {
  BuildOptions,
  CfRequest,
  DispatcherConfig,
  Handler,
  HandlerOptions,
  HostRouter,
  RedirectOptions,
  Rule,
  ServiceOptions,
} from './types';
import { mountTaistampHandler } from './taistamp';
import { getValue } from './value';

const defaultNotFound: Handler = () =>
  new Response('Not Found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

const mountHandler = <E>(
  router: HostRouter<E>,
  options: HandlerOptions<E>,
): void => {
  // Escape hatch: mount a caller-supplied Handler on
  // any path matching `match` (default `/*`).
  router.all(options.match ?? '/*', options.handler);
};

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

const mountServiceHandler = <E>(
  router: HostRouter<E>,
  options: ServiceOptions<E>,
): void => {
  // Hand off to a Cloudflare service binding (RPC
  // worker-to-worker, bypasses DNS).
  router.all(options.match ?? '/*', (request, env) =>
    getValue(options.service, env).fetch(request));
};

const buildHostRouter = <E>(
  host: string,
  rules: readonly Rule<E>[] | Rule<E>,
  buildOptions: BuildOptions<E>,
): HostRouter<E> => {
  const router: HostRouter<E> = IttyRouter<
    CfRequest,
    [E, ExecutionContext],
    Response | undefined
  >();
  const ruleList: readonly Rule<E>[] = Array.isArray(rules) ? rules : [rules];
  for (const rule of ruleList) {
    if ('handler' in rule) {
      // caller-supplied Handler.
      mountHandler(router, rule);
    } else if ('redirectTo' in rule) {
      // host- or path-scoped redirect.
      mountRedirectHandler(router, rule);
    } else if ('service' in rule) {
      // Cloudflare service-binding delegation.
      mountServiceHandler(router, rule);
    } else if ('taistamp' in rule) {
      // /.well-known/taistamp + sibling 404.
      mountTaistampHandler(router, rule, buildOptions);
    } else {
      // Reachable only if the type system was bypassed
      // (cast, JSON import, etc.); log + skip rather
      // than crash at construction.
      console.warn(
        `[sass-dispatcher] ${host}: rule has no recognised ` +
        'discriminant (handler/redirectTo/service/taistamp), ' +
        'skipping:',
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
  const buildOptions: BuildOptions<E> = { notFound };
  const routers = new Map(
    Object.entries(config.hosts ?? {}).map(
      ([host, rules]) =>
        [host, buildHostRouter(host, rules, buildOptions)] as const,
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
