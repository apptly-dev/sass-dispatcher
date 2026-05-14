/**
 * Cloudflare API response shapes. We type-only re-export from
 * the official SDK so call sites import from `../types` without
 * needing to know which Stainless-generated subpath owns each
 * shape.
 */

import type Cloudflare from 'cloudflare';

export type TokenVerifyResponse = Cloudflare.User.TokenVerifyResponse;
export type UserGetResponse = Cloudflare.User.UserGetResponse;
export type Zone = Cloudflare.Zones.Zone;
export type CustomHostname = Cloudflare.CustomHostnames.CustomHostnameListResponse;
export type FallbackOrigin = Cloudflare.CustomHostnames.FallbackOriginGetResponse;
