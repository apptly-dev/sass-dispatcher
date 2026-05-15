import type Cloudflare from 'cloudflare';

import { type WorkersDomain } from '../types';

/**
 * Drain CF's paginated
 * `GET /accounts/{account_id}/workers/domains?zone_id=…` via
 * the SDK's async iterator. Worker Custom Domains attach a
 * Worker to a hostname directly and catch traffic regardless
 * of the Host header — the binding flavour that picks up
 * SaaS fallback traffic. Account-scoped, hence the explicit
 * `accountID` parameter.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function list(
  raw: Cloudflare,
  accountID: string,
  zoneID: string,
): Promise<WorkersDomain[]> {
  const domains: WorkersDomain[] = [];
  for await (const domain of raw.workers.domains.list({
    account_id: accountID,
    zone_id: zoneID,
  })) {
    domains.push(domain);
  }
  return domains;
}
