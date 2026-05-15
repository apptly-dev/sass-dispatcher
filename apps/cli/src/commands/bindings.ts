import { defineCommand } from 'citty';
import { consola } from 'consola';

import { AuthError } from '../auth';
import { fatal } from '../exit';
import { withClient } from '../lifecycle';
import { type WorkersDomain, type WorkersRoute } from '../types';

function writeRouteRow(route: WorkersRoute, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ kind: 'route', ...route })}\n`);
    return;
  }
  const script = route.script ?? 'unknown';
  process.stdout.write(`route ${route.id} ${route.pattern} ${script}\n`);
}

function writeDomainRow(domain: WorkersDomain, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ kind: 'domain', ...domain })}\n`);
    return;
  }
  process.stdout.write(`domain ${domain.id} ${domain.hostname} ${domain.service}\n`);
}

const list = defineCommand({
  meta: {
    name: 'list',
    description: 'List Worker bindings on a zone (routes + custom domains)',
  },
  args: {
    zone: {
      type: 'positional',
      description: 'Zone name (e.g., apptly.me)',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit one JSON envelope per row instead of plain fields',
      default: false,
    },
  },
  run: async ({ args }) => {
    await withClient(async ({ client }) => {
      const zone = await client.zonesGet(args.zone);
      if (zone === undefined) {
        fatal(`no zone matching ${args.zone}`);
        return;
      }

      const [routes, domains] = await Promise.all([
        client.workersRoutesList(zone.id),
        // Worker Custom Domains is account-scoped; without a
        // bound account id we can still emit routes, but the
        // user needs to know domains were skipped. Anything
        // other than that specific miss bubbles through
        // `withClient`'s `APIError` reporter.
        client.workersDomainsList(zone.id).catch((error: unknown) => {
          if (error instanceof AuthError && error.code === 'no-account') {
            return undefined;
          }
          throw error;
        }),
      ]);

      if (domains === undefined) {
        consola.warn(
          'CLOUDFLARE_ACCOUNT_ID not set — Worker Custom Domains skipped',
        );
      }
      const domainRows = domains ?? [];

      if (routes.length === 0 && domainRows.length === 0) {
        consola.warn(`no worker bindings on ${args.zone}`);
        return;
      }

      for (const route of routes) writeRouteRow(route, args.json);
      for (const domain of domainRows) writeDomainRow(domain, args.json);
    });
  },
});

/**
 * `cli bindings <subcommand>` — inspect how Workers attach
 * to a zone. `list` reports both legacy Worker Routes
 * (zone-scoped, Host/path patterns) and Worker Custom Domains
 * (account-scoped, hostname-attached). Custom Domains is the
 * binding flavour that catches Cloudflare-for-SaaS fallback
 * traffic — that's why this exists.
 */
export default defineCommand({
  meta: {
    name: 'bindings',
    description: 'Worker bindings on a zone',
  },
  subCommands: { list },
});
