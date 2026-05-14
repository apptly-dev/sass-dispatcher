import type Cloudflare from 'cloudflare';

import { type FallbackOrigin } from '../types';

/**
 * Look up the SaaS fallback-origin configuration for a zone
 * via `GET /zones/{zone_id}/custom_hostnames/fallback_origin`.
 * Returns the SDK envelope as-is; CF responds 404 when no
 * fallback origin is configured, which surfaces as an
 * `APIError` through the normal error path.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export function get(
  raw: Cloudflare,
  zoneId: string,
): Promise<FallbackOrigin> {
  return raw.customHostnames.fallbackOrigin.get({ zone_id: zoneId });
}
