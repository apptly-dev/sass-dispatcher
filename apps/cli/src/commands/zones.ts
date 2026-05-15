import { defineCommand } from 'citty';
import { consola } from 'consola';

import { AuthError } from '../auth';
import { fatal } from '../exit';
import { formatFallbackBundle } from '../format';
import { withClient } from '../lifecycle';
import {
  type FallbackBundle,
  type WorkersDomain,
  type WorkersRoute,
  type Zone,
} from '../types';

function formatZone(zone: Zone): string {
  return `${zone.id} ${zone.name} ${zone.status ?? 'unknown'}`;
}

function formatRoute(route: WorkersRoute): string {
  return `${route.id} ${route.pattern} ${route.script ?? 'unknown'}`;
}

function formatDomain(domain: WorkersDomain): string {
  return `${domain.id} ${domain.hostname} ${domain.service}`;
}

function writeZoneRow(zone: Zone, json: boolean): void {
  const line = json ? JSON.stringify(zone) : formatZone(zone);
  process.stdout.write(`${line}\n`);
}

interface ZoneBindings {
  // `domains` is `undefined` when CLOUDFLARE_ACCOUNT_ID is
  // unset — the lookup couldn't run, distinct from "ran and
  // found nothing" which is `[]`.
  domains: undefined | WorkersDomain[]
  routes: WorkersRoute[]
}

interface ZoneDetail {
  bindings: ZoneBindings
  bundle: FallbackBundle
  zone: Zone
}

interface ZoneDetailWriteOptions {
  hostnamesDetail: boolean
  json: boolean
}

function writeZoneDetail(
  detail: ZoneDetail,
  options: ZoneDetailWriteOptions,
): void {
  if (options.json) {
    // Explicit field order (zone → hostnames → fallback →
    // bindings) reads from SaaS layer down to worker layer.
    // `JSON.stringify` drops keys with `undefined` values, so
    // an unset fallback or a domains list we couldn't query
    // shows up as the absence of those keys.
    const envelope = {
      zone: detail.zone,
      hostnames: detail.bundle.hostnames,
      fallback: detail.bundle.fallback,
      bindings: {
        routes: detail.bindings.routes,
        domains: detail.bindings.domains,
      },
    };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  const { zone, bundle, bindings } = detail;
  process.stdout.write(`zone: ${formatZone(zone)}\n`);
  for (const line of formatFallbackBundle(bundle, {
    hostnamesDetail: options.hostnamesDetail,
  })) {
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write('bindings:\n');
  if (bindings.routes.length === 0) {
    process.stdout.write('  routes: none\n');
  } else {
    process.stdout.write('  routes:\n');
    for (const route of bindings.routes) {
      process.stdout.write(`    ${formatRoute(route)}\n`);
    }
  }
  if (bindings.domains === undefined) {
    process.stdout.write('  domains: unknown (CLOUDFLARE_ACCOUNT_ID unset)\n');
  } else if (bindings.domains.length === 0) {
    process.stdout.write('  domains: none\n');
  } else {
    process.stdout.write('  domains:\n');
    for (const domain of bindings.domains) {
      process.stdout.write(`    ${formatDomain(domain)}\n`);
    }
  }
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
    description: 'Detailed view of a zone (metadata + hostnames + fallback + bindings)',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Zone name (e.g., apptly.me)',
      required: true,
    },
    hostnamesDetail: {
      type: 'boolean',
      description: 'Expand each hostname row to the verbose diagnostic block (origin, SSL, errors)',
      default: false,
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
      const [bundle, routes, domains] = await Promise.all([
        client.fallbackWithHostnames(zone.id),
        client.workersRoutesList(zone.id),
        client.workersDomainsList(zone.id).catch((error: unknown) => {
          // Account-scoped lookup: without an account id we
          // can't query it. Surface as `undefined` (distinct
          // from "ran and found nothing") so the aggregator
          // can render the gap rather than failing.
          if (error instanceof AuthError && error.code === 'no-account') {
            return undefined;
          }
          throw error;
        }),
      ]);
      writeZoneDetail(
        {
          zone,
          bundle,
          bindings: { routes, domains },
        },
        { hostnamesDetail: args.hostnamesDetail, json: args.json },
      );
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
