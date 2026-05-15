import { type FallbackBundle, type FallbackOrigin } from '../types';
import { formatHostname, formatHostnameDetail } from './hostname';

/**
 * Compact one-line summary: `<origin> <status>` (with `unset`
 * / `unknown` fallbacks for missing fields). Used standalone
 * when emitting the fallback line inside a larger view.
 */
export function formatFallback(fallback: FallbackOrigin): string {
  const origin = fallback.origin ?? 'unset';
  const status = fallback.status ?? 'unknown';
  return `${origin} ${status}`;
}

/**
 * Render the SaaS-routing snapshot as the section lines used
 * by both `fallback get` and `zones get`: a `hostnames:`
 * header followed by per-row blocks, then a `fallback: …`
 * line (or `fallback: unset` when CF had no fallback to
 * return). When `hostnamesDetail` is `true` the per-row block
 * comes from {@link formatHostnameDetail}; otherwise the
 * compact one-liner is used.
 *
 * Returns lines without an outer indent; the caller prepends
 * any prefix for its position in a larger composition (e.g.
 * `zones get`'s top-level sections).
 */
export function formatFallbackBundle(
  bundle: FallbackBundle,
  options: { hostnamesDetail: boolean },
): string[] {
  const lines: string[] = [];
  const { fallback, hostnames } = bundle;

  if (hostnames.length === 0) {
    lines.push('hostnames: none');
  } else {
    lines.push('hostnames:');
    if (options.hostnamesDetail) {
      for (const hostname of hostnames) {
        for (const line of formatHostnameDetail(hostname)) {
          lines.push(`  ${line}`);
        }
      }
    } else {
      for (const hostname of hostnames) {
        lines.push(`  ${formatHostname(hostname)}`);
      }
    }
  }

  lines.push(
    `fallback: ${fallback === undefined ? 'unset' : formatFallback(fallback)}`,
  );

  return lines;
}
