import type Cloudflare from 'cloudflare';

import { type Zone } from '../types';

/**
 * Drain CF's paginated `GET /zones` via the SDK's async
 * iterator. Returns a single buffered array — fine for the
 * hundreds of zones a tenant account typically sees. Switch
 * to a streaming variant if that ceiling ever bites.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function list(raw: Cloudflare): Promise<Zone[]> {
  const zones: Zone[] = [];
  for await (const zone of raw.zones.list()) {
    zones.push(zone);
  }
  return zones;
}

/**
 * Single zone lookup by exact name. Returns `undefined` when
 * the credential cannot see a zone with that name — callers
 * decide whether to treat that as an error. CF returns at
 * most one match for an exact-name filter, so the iterator
 * stops after the first yield.
 *
 * Sibling helper of {@link Client}: takes the raw SDK
 * instance so it can be unit-tested without instantiating
 * `Client`.
 */
export async function get(
  raw: Cloudflare,
  name: string,
): Promise<undefined | Zone> {
  for await (const zone of raw.zones.list({ name })) {
    return zone;
  }
  return undefined;
}
