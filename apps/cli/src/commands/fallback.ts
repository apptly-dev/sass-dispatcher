import { defineCommand } from 'citty';

import { fatal } from '../exit';
import { withClient } from '../lifecycle';
import { type FallbackOrigin } from '../types';

function formatFallback(fallback: FallbackOrigin): string {
  const origin = fallback.origin ?? 'unset';
  const status = fallback.status ?? 'unknown';
  return `${origin} ${status}`;
}

const get = defineCommand({
  meta: {
    name: 'get',
    description: 'Show the SaaS fallback origin for a zone',
  },
  args: {
    zone: {
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
      const zone = await client.zonesGet(args.zone);
      if (zone === undefined) {
        fatal(`no zone matching ${args.zone}`);
        return;
      }
      const fallback = await client.fallbackOriginGet(zone.id);
      const line = args.json ? JSON.stringify(fallback) : formatFallback(fallback);
      process.stdout.write(`${line}\n`);
    });
  },
});

/**
 * `cli fallback <subcommand>` — Cloudflare-for-SaaS
 * fallback-origin inspection. `get` returns the single
 * fallback record for the named zone via
 * `GET /zones/{zone_id}/custom_hostnames/fallback_origin`.
 * CF responds 404 when no fallback is configured, which
 * surfaces through {@link reportAPIError} as `[HTTP 404] …`.
 */
export default defineCommand({
  meta: {
    name: 'fallback',
    description: 'Cloudflare-for-SaaS fallback origin',
  },
  subCommands: { get },
});
