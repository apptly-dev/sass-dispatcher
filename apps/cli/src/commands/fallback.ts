import { defineCommand } from 'citty';

import { fatal } from '../exit';
import { formatFallbackBundle } from '../format';
import { withClient } from '../lifecycle';

const get = defineCommand({
  meta: {
    name: 'get',
    description: 'Show the SaaS fallback origin for a zone with the hostnames that depend on it',
  },
  args: {
    zone: {
      type: 'positional',
      description: 'Zone name (e.g., apptly.me)',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit the full bundle envelope instead of plain fields',
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
      const bundle = await client.fallbackWithHostnames(zone.id);
      if (args.json) {
        process.stdout.write(`${JSON.stringify(bundle)}\n`);
        return;
      }
      for (const line of formatFallbackBundle(bundle, { hostnamesDetail: true })) {
        process.stdout.write(`${line}\n`);
      }
    });
  },
});

/**
 * `cli fallback <subcommand>` — Cloudflare-for-SaaS
 * fallback-origin inspection. `get` returns a single
 * SaaS-routing snapshot for the named zone via
 * `Client.fallbackWithHostnames`: the fallback origin
 * (`fallback: unset` when CF responds 404) together with
 * every custom hostname on the zone. Hostnames render with
 * the verbose detail block by default, exposing each
 * hostname's `custom_origin_server` so callers can see
 * which entries actually depend on the fallback.
 */
export default defineCommand({
  meta: {
    name: 'fallback',
    description: 'Cloudflare-for-SaaS fallback origin',
  },
  subCommands: { get },
});
