import type Cloudflare from 'cloudflare';

import { type CustomHostname } from '../types';

/**
 * Drain CF's paginated `GET /zones/{zone_id}/custom_hostnames`
 * via the SDK's async iterator. Returns a single buffered
 * array; per-zone counts in SaaS deployments stay in the
 * hundreds typically. Switch to a streaming variant if that
 * ceiling ever bites.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function list(
  raw: Cloudflare,
  zoneID: string,
): Promise<CustomHostname[]> {
  const hostnames: CustomHostname[] = [];
  for await (const hostname of raw.customHostnames.list({ zone_id: zoneID })) {
    hostnames.push(hostname);
  }
  return hostnames;
}
