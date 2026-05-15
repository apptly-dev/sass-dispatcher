import { type DoHResponse } from './types';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/**
 * Query Cloudflare's public DoH endpoint and return the
 * JSON envelope verbatim. Anonymous — does not use the CLI's
 * auth pipeline. Caller decides how to format / interpret
 * `Answer`, `Authority`, and `Status` (NXDOMAIN, SERVFAIL,
 * etc.) since "no records" is a valid response shape, not
 * an error of the tool.
 */
export async function resolve(
  name: string,
  type: string,
): Promise<DoHResponse> {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set('name', name);
  url.searchParams.set('type', type);
  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' },
  });
  if (!response.ok) {
    throw new Error(
      `DoH query returned HTTP ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as DoHResponse;
}
