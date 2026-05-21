/**
 * Reverse-proxy handler — forwards an inbound request
 * to a target origin via the global `fetch`. The
 * target's path (if any) is honoured as a prefix; the
 * inbound URL's path and query are appended after it.
 *
 * Trust boundary: the inbound request is untrusted with
 * respect to forwarding headers (`forwarded`, `via`,
 * `x-forwarded-*`, `x-real-ip`). The dispatcher is the
 * authoritative writer — client-supplied values are
 * stripped before authoritative ones are set from the
 * inbound envelope, so upstream sees only the
 * dispatcher's view. `cf-connecting-ip` is treated as
 * authoritative because the worker runs behind
 * Cloudflare's edge, which sets and sanitises it;
 * outside that deployment context the assumption
 * breaks.
 *
 * When the target is reachable only through a Custom
 * Hostname or sibling zone on Cloudflare (e.g. the
 * worker itself is bound to the apex), set
 * `resolveOverride` to the upstream's DNS-resolvable
 * name. The public URL and Host header retain the
 * user-facing target; only DNS resolution is
 * redirected.
 *
 * Future: outbound request signing — would mirror the
 * taistamp secret/factory pattern. Not implemented.
 */

import type { ProxyTarget } from './types';
import {
  type KeyedHandlerBuilder,
  newKeyedHandlerStore,
} from './handler-store';

/**
 * Headers a client might supply to spoof its forwarding
 * chain. The dispatcher is the authoritative writer for
 * `x-forwarded-host`, `x-forwarded-proto`,
 * `x-forwarded-for`; any client value is stripped
 * before the outbound `fetch` so upstream sees only the
 * dispatcher's view of the envelope.
 */
const FORWARDING_HEADERS = [
  'forwarded',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
] as const;

/**
 * Strip the client-supplied forwarding headers listed
 * in {@link FORWARDING_HEADERS} from `headers` in
 * place. Caller is expected to set authoritative values
 * immediately afterwards.
 */
const sanitiseForwardingHeaders = (headers: Headers): void => {
  for (const name of FORWARDING_HEADERS) {
    headers.delete(name);
  }
};

/**
 * Build the optional `fetch` init carrying
 * `cf.resolveOverride`. Returns `undefined` rather than
 * `{ cf: undefined }` so the call site can branch on
 * presence without spreading a phantom `cf` field
 * through Workers' init.
 */
const makeProxyInit = (
  target: ProxyTarget,
): RequestInit<RequestInitCfProperties> | undefined => {
  if (target.resolveOverride === undefined) {
    return undefined;
  }
  return { cf: { resolveOverride: target.resolveOverride } };
};

/**
 * Request-time engine. Rewrites the inbound URL's
 * path + query onto `targetURL`, strips client-supplied
 * forwarding headers, then sets authoritative
 * `x-forwarded-*` from the inbound envelope. Issues a
 * single `fetch` against the global, with `init.cf`
 * applied when supplied.
 */
const handleProxy = (
  request: Request,
  targetURL: URL,
  init?: RequestInit<RequestInitCfProperties>,
): Promise<Response> => {
  const inbound = new URL(request.url);
  // Honour any base path on `targetURL` as a prefix:
  // strip trailing slashes off the base then concatenate
  // with the inbound path. Inbound.pathname always
  // starts with '/' so empty/no-path bases work too.
  const basePath = targetURL.pathname.replace(/\/+$/, '');
  const rewritten = new URL(
    basePath + inbound.pathname + inbound.search,
    targetURL,
  );

  const headers = new Headers(request.headers);
  sanitiseForwardingHeaders(headers);
  headers.set('x-forwarded-host', inbound.host);
  // strip trailing ':' from URL.protocol ('https:' → 'https')
  headers.set('x-forwarded-proto', inbound.protocol.slice(0, -1));
  const clientIP = request.headers.get('cf-connecting-ip');
  if (clientIP) {
    headers.set('x-forwarded-for', clientIP);
  }

  // Re-wrap: `new Request(input, init)` can't override
  // the input's headers without first reading them off
  // the inner clone — hence the double constructor.
  const outbound = new Request(
    new Request(rewritten, request),
    { headers, redirect: 'manual' },
  );

  return init === undefined ?
    fetch(outbound) :
    fetch(outbound, init);
};

/**
 * Build a {@link Handler} closed over a parsed
 * `targetURL` and an optional `init` carrying
 * `cf.resolveOverride`. Runs once per distinct
 * descriptor via {@link newKeyedHandlerStore}'s cache,
 * so the URL parse and init assembly happen at most
 * once per (serialised) target per isolate.
 */
const buildProxy: KeyedHandlerBuilder<ProxyTarget> = (target) => {
  const targetURL = new URL(target.target);
  const init = makeProxyInit(target);
  return (request) => handleProxy(request, targetURL, init);
};

/**
 * Serialise a {@link ProxyTarget} to a string cache key.
 * Normalises `target` through the URL constructor so
 * equivalent `string` and `URL` forms collapse to one
 * slot. Combines with `resolveOverride` so two
 * descriptors that diverge only on the override get
 * separate cached handlers.
 */
const serialiseTarget = (target: ProxyTarget): string =>
  `${new URL(target.target).href}|${target.resolveOverride ?? ''}`;

/**
 * Memoised factory that yields a {@link Handler}
 * proxying inbound requests to `target`. The handler
 * ignores `env` / `context` — all routing decisions
 * are baked into the target descriptor at build time.
 *
 * Per-isolate cache keyed by the serialised descriptor,
 * so equal-content distinct `ProxyTarget` objects share
 * one Handler. Bounded by the number of distinct
 * targets routed through the dispatcher.
 */
export const proxyHandler = newKeyedHandlerStore<ProxyTarget>(
  buildProxy,
  serialiseTarget,
);
