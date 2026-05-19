import type { IRequest, IttyRouterType } from 'itty-router';

/**
 * itty's `IRequest.cf` is the broader `CfProperties`,
 * but Cloudflare delivers an `IncomingRequest` at
 * runtime. The dispatcher narrows itty's request type
 * at the router boundary so route handlers see the
 * cf-aware request that {@link Handler} expects.
 */
export type CfRequest = IRequest & Request<unknown, IncomingRequestCfProperties>;

/**
 * The per-host router used by `newDispatcher` and by
 * the `mount*Handler` helpers each rule variant
 * provides. Factored once so every mounter and the
 * dispatcher share the same `E`-parameterised shape.
 */
export type HostRouter<E = unknown> = IttyRouterType<
  CfRequest,
  [E, ExecutionContext],
  Response | undefined
>;

/**
 * HTTP status codes valid for the redirect rule. The
 * 30x family minus 300 (Multiple Choices, no Location
 * required), 304 (Not Modified, conditional response),
 * 305 (Use Proxy, deprecated by RFC 7231) and 306
 * (reserved/unused).
 */
export type RedirectCode = 301 | 302 | 303 | 307 | 308;

/**
 * The redirect variant of {@link Rule}. Emits
 * `status + Location: redirectTo` for any path
 * matching `match` (an itty path pattern, default
 * `/*`). `redirectTo` is sent verbatim — no `:param`
 * substitution from `match` yet.
 */
export interface RedirectOptions {
  readonly match?: string
  readonly redirectCode: RedirectCode
  readonly redirectTo: string
}

/**
 * The taistamp variant of {@link Rule}. Claims
 * `/.well-known/taistamp` on the owning host and 404s
 * anything under the prefix; the accessor pulls the
 * secret value out of the caller's env so the lib
 * never names a specific env field. The TAI64N spec
 * reserves the path, so no `match` override.
 */
export interface TaistampOptions<E = unknown> {
  readonly taistamp: (env: E) => string
}

/**
 * The shape every dispatch target collapses to:
 * `(request, env?, context?) => Response`. `request`
 * carries Cloudflare's `IncomingRequestCfProperties`
 * so handlers can read `request.cf` without casts.
 *
 * The dispatcher narrows itty's broader `IRequest`
 * to this shape via the router's generic parameter,
 * keeping the reconciliation in library internals
 * rather than on the public surface.
 *
 * `env` and `context` are optional because handlers
 * built through {@link newHandlerStore} typically
 * absorb env-derived inputs at build time and ignore
 * the fetch-time pair; the dispatcher still forwards
 * both at every call site. Consumers that need typed
 * env access (notably `DispatcherConfig.notFound`)
 * narrow with a guard or non-null assertion.
 */
export type Handler<E = unknown> = (
  request: Request<unknown, IncomingRequestCfProperties>,
  env?: E,
  context?: ExecutionContext,
) => Promise<Response> | Response;

/**
 * A single dispatch rule. Per-host rule arrays are
 * tried in order — first match wins. Each variant
 * pairs with a `mount*Handler` colocated with the
 * variant's implementation.
 */
export type Rule<E = unknown> = RedirectOptions | TaistampOptions<E>;

/**
 * Per-host rule tables, keyed by `URL.hostname`. The
 * dispatcher matches the request's hostname against
 * these keys; unknown hostnames fall through to
 * {@link DispatcherConfig.notFound}.
 */
export type HostRules<E = unknown> = Readonly<
  Record<string, readonly Rule<E>[]>
>;

/**
 * Configuration accepted by {@link newDispatcher}.
 */
export interface DispatcherConfig<E = unknown> {
  readonly hosts?: HostRules<E>
  readonly notFound?: Handler<E>
}
