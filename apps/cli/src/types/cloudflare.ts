/**
 * Cloudflare API response shapes plus the composed bundles
 * we return from `Client`. Single-shape entries are type-only
 * re-exports of the official SDK so call sites import from
 * `../types` without needing to know which Stainless-generated
 * subpath owns each shape.
 */

import type Cloudflare from 'cloudflare';

export type TokenVerifyResponse = Cloudflare.User.TokenVerifyResponse;
export type UserGetResponse = Cloudflare.User.UserGetResponse;
export type Zone = Cloudflare.Zones.Zone;
export type CustomHostname = Cloudflare.CustomHostnames.CustomHostnameListResponse;
export type FallbackOrigin = Cloudflare.CustomHostnames.FallbackOriginGetResponse;
export type WorkersRoute = Cloudflare.Workers.RouteListResponse;
export type WorkersDomain = Cloudflare.Workers.DomainListResponse;

/**
 * SaaS-routing snapshot for a zone: the fallback origin
 * (`undefined` when CF returns 404, i.e. unset) paired with
 * every custom hostname on the zone. Serialised directly to
 * stdout under `--json` and rendered through the shared
 * `formatFallbackBundle` formatter in plain text.
 */
export interface FallbackBundle {
  fallback: FallbackOrigin | undefined
  hostnames: CustomHostname[]
}
