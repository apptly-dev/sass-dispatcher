import { defineCommand } from 'citty';
import { consola } from 'consola';

import { fatal } from '../exit';
import { withClient } from '../lifecycle';
import { type CustomHostname } from '../types';

function formatHostname(hostname: CustomHostname): string {
  const status = hostname.status ?? 'unknown';
  const sslStatus = hostname.ssl?.status ?? 'unknown';
  return `${hostname.id} ${hostname.hostname} ${status} ${sslStatus}`;
}

function writeHostnameRow(hostname: CustomHostname, json: boolean): void {
  const line = json ? JSON.stringify(hostname) : formatHostname(hostname);
  process.stdout.write(`${line}\n`);
}

const list = defineCommand({
  meta: {
    name: 'list',
    description: 'List custom hostnames in a zone',
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
      const hostnames = await client.customHostnamesList(zone.id);
      if (hostnames.length === 0) {
        consola.warn(`no custom hostnames in ${args.zone}`);
        return;
      }
      for (const hostname of hostnames) writeHostnameRow(hostname, args.json);
    });
  },
});

/**
 * `cli hostnames <subcommand>` — Cloudflare-for-SaaS
 * custom-hostname inspection. `list` drains every page of
 * `GET /zones/{zone_id}/custom_hostnames` for the named
 * zone; the zone name is resolved live via `zones.get` each
 * call (no on-disk id cache yet).
 */
export default defineCommand({
  meta: {
    name: 'hostnames',
    description: 'Cloudflare-for-SaaS custom hostnames',
  },
  subCommands: { list },
});
