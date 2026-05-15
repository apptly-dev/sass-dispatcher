import type Cloudflare from 'cloudflare';

import { type WorkersRoute } from '../types';

/**
 * Drain CF's paginated `GET /zones/{zone_id}/workers/routes`
 * via the SDK's async iterator. Lists legacy Worker Routes
 * (Host/path pattern bindings) attached to the zone. Worker
 * Custom Domains live on a separate account-scoped endpoint
 * — see the `workers-domains` sibling.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function list(
  raw: Cloudflare,
  zoneID: string,
): Promise<WorkersRoute[]> {
  const routes: WorkersRoute[] = [];
  for await (const route of raw.workers.routes.list({ zone_id: zoneID })) {
    routes.push(route);
  }
  return routes;
}
