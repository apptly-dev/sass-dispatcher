import { defineCommand } from 'citty';
import { consola } from 'consola';

import { APIError } from '../cf';
import { fatal } from '../exit';
import { withClient } from '../lifecycle';
import {
  type CustomHostname,
  type FallbackOrigin,
  type Zone,
} from '../types';

function formatZone(zone: Zone): string {
  return `${zone.id} ${zone.name} ${zone.status ?? 'unknown'}`;
}

function formatHostname(hostname: CustomHostname): string {
  const status = hostname.status ?? 'unknown';
  const sslStatus = hostname.ssl?.status ?? 'unknown';
  return `${hostname.id} ${hostname.hostname} ${status} ${sslStatus}`;
}

function formatFallback(fallback: FallbackOrigin): string {
  const origin = fallback.origin ?? 'unset';
  const status = fallback.status ?? 'unknown';
  return `${origin} ${status}`;
}

function writeZoneRow(zone: Zone, json: boolean): void {
  const line = json ? JSON.stringify(zone) : formatZone(zone);
  process.stdout.write(`${line}\n`);
}

interface ZoneDetail {
  fallback: FallbackOrigin | undefined
  hostnames: CustomHostname[]
  zone: Zone
}

function writeZoneDetail(detail: ZoneDetail, json: boolean): void {
  if (json) {
    // Explicit field order (zone → hostnames → fallback) reads
    // logically. `JSON.stringify` drops keys with `undefined`
    // values, so an unset fallback shows up as the absence of
    // the `fallback` key — matching `FallbackOrigin | undefined`.
    const envelope = {
      zone: detail.zone,
      hostnames: detail.hostnames,
      fallback: detail.fallback,
    };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  const { zone, hostnames, fallback } = detail;
  process.stdout.write(`zone: ${formatZone(zone)}\n`);
  if (hostnames.length === 0) {
    process.stdout.write('hostnames: none\n');
  } else {
    process.stdout.write('hostnames:\n');
    for (const hostname of hostnames) {
      process.stdout.write(`  ${formatHostname(hostname)}\n`);
    }
  }
  process.stdout.write(
    `fallback: ${fallback === undefined ? 'unset' : formatFallback(fallback)}\n`,
  );
}

const list = defineCommand({
  meta: {
    name: 'list',
    description: 'List zones visible to the active credential',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Emit one JSON envelope per row instead of plain fields',
      default: false,
    },
  },
  run: async ({ args }) => {
    await withClient(async ({ client }) => {
      const zones = await client.zonesList();
      if (zones.length === 0) {
        // `warn` (not `info`) keeps this off stdout; consola's
        // default reporter routes info → stdout, which would
        // pollute pipelines consuming the data rows.
        consola.warn('no zones visible to this credential');
        return;
      }
      for (const zone of zones) writeZoneRow(zone, args.json);
    });
  },
});

const get = defineCommand({
  meta: {
    name: 'get',
    description: 'Detailed view of a zone (metadata + hostnames + fallback)',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Zone name (e.g., apptly.me)',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit a single composite JSON envelope instead of plain sections',
      default: false,
    },
  },
  run: async ({ args }) => {
    await withClient(async ({ client }) => {
      const zone = await client.zonesGet(args.name);
      if (zone === undefined) {
        fatal(`no zone matching ${args.name}`);
        return;
      }
      const [hostnames, fallback] = await Promise.all([
        client.customHostnamesList(zone.id),
        client.fallbackOriginGet(zone.id).catch((error: unknown) => {
          // CF returns 404 when no fallback is configured — that's
          // a normal state for a fresh zone, so surface it as
          // `unset` rather than failing the whole aggregated view.
          if (error instanceof APIError && error.status === 404) {
            return undefined;
          }
          throw error;
        }),
      ]);
      writeZoneDetail({ zone, hostnames, fallback }, args.json);
    });
  },
});

/**
 * `cli zones <subcommand>` — Cloudflare zone lookups.
 * `list` drains every page of `GET /zones`; `get` resolves
 * the zone by exact name and combines its metadata with the
 * custom-hostname list and SaaS fallback origin so callers
 * see what's wired on a tenant zone in one call.
 */
export default defineCommand({
  meta: {
    name: 'zones',
    description: 'Cloudflare zone lookups',
  },
  subCommands: { list, get },
});
