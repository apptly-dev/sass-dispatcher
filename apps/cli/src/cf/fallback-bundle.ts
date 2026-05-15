import type Cloudflare from 'cloudflare';
import { APIError } from 'cloudflare';

import { type FallbackBundle } from '../types';
import * as customHostnames from './custom-hostnames';
import * as fallbackOrigin from './fallback-origin';

/**
 * Fetch the SaaS-routing snapshot for a zone in one round-trip
 * fan-out: the fallback origin and every custom hostname on
 * the zone. CF returns 404 from the fallback endpoint when no
 * fallback is configured — that's a normal state on a fresh
 * SaaS zone, so the 404 maps to `fallback === undefined`
 * rather than failing the whole bundle.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function get(
  raw: Cloudflare,
  zoneID: string,
): Promise<FallbackBundle> {
  const [fallback, hostnames] = await Promise.all([
    fallbackOrigin.get(raw, zoneID).catch((error: unknown) => {
      if (error instanceof APIError && error.status === 404) {
        return undefined;
      }
      throw error;
    }),
    customHostnames.list(raw, zoneID),
  ]);
  return { fallback, hostnames };
}
