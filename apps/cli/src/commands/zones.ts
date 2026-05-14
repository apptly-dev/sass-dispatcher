import { defineCommand } from 'citty';
import { consola } from 'consola';

import { fatal } from '../exit';
import { withClient } from '../lifecycle';
import { type Zone } from '../types';

function formatZone(zone: Zone): string {
  return `${zone.id} ${zone.name} ${zone.status ?? 'unknown'}`;
}

function writeZoneRow(zone: Zone, json: boolean): void {
  const line = json ? JSON.stringify(zone) : formatZone(zone);
  process.stdout.write(`${line}\n`);
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
    description: 'Look up a single zone by exact name',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Zone name (e.g., apptly.me)',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit the full JSON envelope instead of plain fields',
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
      writeZoneRow(zone, args.json);
    });
  },
});

/**
 * `cli zones <subcommand>` — Cloudflare zone lookups.
 * `list` drains every page of `GET /zones`; `get` filters
 * by exact name and returns at most one row.
 */
export default defineCommand({
  meta: {
    name: 'zones',
    description: 'Cloudflare zone lookups',
  },
  subCommands: { list, get },
});
