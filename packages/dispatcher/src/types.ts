import type { IRequest, IttyRouterType } from 'itty-router';

/**
 * The per-host router used by `newDispatcher` and by
 * the `mount*Handler` helpers each rule variant
 * provides. Factored once so every mounter and the
 * dispatcher share the same `E`-parameterised shape.
 */
export type HostRouter<E = unknown> = IttyRouterType<
  IRequest,
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
  readonly notFound?: (
    request: Request<unknown, IncomingRequestCfProperties>,
    env: E,
    context: ExecutionContext,
  ) => Promise<Response> | Response
}
