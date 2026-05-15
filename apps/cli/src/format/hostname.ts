import { type CustomHostname } from '../types';

/**
 * Compact one-line summary: `<id> <hostname> <status> <ssl-status>`.
 * The view used by `zones get` by default, where hostnames
 * sit alongside other zone sections and the row needs to
 * stay easy to skim.
 */
export function formatHostname(hostname: CustomHostname): string {
  const status = hostname.status ?? 'unknown';
  const sslStatus = hostname.ssl?.status ?? 'unknown';
  return `${hostname.id} ${hostname.hostname} ${status} ${sslStatus}`;
}

/**
 * Verbose multi-line block exposing the operational fields
 * (origin server, SSL method/CA, verification errors) that
 * the compact summary hides. The default for `hostnames list`
 * and `fallback get`, and the opt-in for
 * `zones get --hostnames-detail`. Returns lines without
 * indent; the caller adds any prefix needed for its section
 * nesting.
 */
export function formatHostnameDetail(hostname: CustomHostname): string[] {
  const lines: string[] = [`${hostname.id} ${hostname.hostname}`, `  status: ${hostname.status ?? 'unknown'}`];

  const ssl = hostname.ssl;
  if (ssl === undefined) {
    lines.push('  ssl: unknown');
  } else {
    const sslMeta: string[] = [];
    if (ssl.method !== undefined) sslMeta.push(`method=${ssl.method}`);
    if (ssl.certificate_authority !== undefined) {
      sslMeta.push(`ca=${ssl.certificate_authority}`);
    }
    const sslSuffix = sslMeta.length === 0 ? '' : ` (${sslMeta.join(', ')})`;
    lines.push(`  ssl: ${ssl.status ?? 'unknown'}${sslSuffix}`);
  }

  lines.push(`  origin: ${hostname.custom_origin_server ?? '→ fallback'}`);
  if (hostname.custom_origin_sni !== undefined) {
    lines.push(`  sni: ${hostname.custom_origin_sni}`);
  }

  const errors = hostname.verification_errors ?? [];
  lines.push(`  errors: ${errors.length === 0 ? 'none' : errors.join('; ')}`);

  const sslErrors = ssl?.validation_errors ?? [];
  if (sslErrors.length > 0) {
    const msg = sslErrors
      .map((entry) => entry.message ?? '?')
      .join('; ');
    lines.push(`  ssl errors: ${msg}`);
  }

  return lines;
}
