// cspell:words nslookup
import { defineCommand } from 'citty';
import { consola } from 'consola';

import * as doh from '../doh';
import { fatal } from '../exit';
import { type DoHResourceRecord } from '../types';

const TYPE_NAMES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV',
  257: 'CAA',
};

function formatAnswer(answer: DoHResourceRecord): string {
  const type = TYPE_NAMES[answer.type] ?? String(answer.type);
  return `${answer.name} ${answer.TTL} ${type} ${answer.data}`;
}

function writeAnswerRow(answer: DoHResourceRecord, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    return;
  }
  process.stdout.write(`${formatAnswer(answer)}\n`);
}

/**
 * `cli dns <name>` — anonymous DoH query against Cloudflare's
 * 1.1.1.1 public resolver. Exists so the CLI can probe DNS
 * without depending on `dig`/`host`/`nslookup` being present
 * on the host; useful when sanity-checking what CF SaaS would
 * see during fallback forwarding.
 */
export default defineCommand({
  meta: {
    name: 'dns',
    description: 'Resolve a hostname via Cloudflare DoH',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Hostname to resolve (e.g., apptly.me)',
      required: true,
    },
    type: {
      type: 'string',
      description: 'Record type (A, AAAA, CNAME, TXT, MX, NS, SOA, …)',
      default: 'A',
    },
    json: {
      type: 'boolean',
      description: 'Emit one JSON envelope per answer instead of plain fields',
      default: false,
    },
  },
  run: async ({ args }) => {
    let response;
    try {
      response = await doh.resolve(args.name, args.type);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      fatal(message);
      return;
    }

    const answers = response.Answer ?? [];
    if (response.Status !== 0) {
      consola.warn(
        `DoH status ${response.Status} for ${args.name} ${args.type}` +
        (response.Comment === undefined ? '' : `: ${response.Comment}`),
      );
      return;
    }
    if (answers.length === 0) {
      consola.warn(`no ${args.type} records for ${args.name}`);
      return;
    }

    for (const answer of answers) writeAnswerRow(answer, args.json);
  },
});
