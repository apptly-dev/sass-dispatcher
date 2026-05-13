/**
 * Types and runtime parsers for the parts of wrangler we
 * borrow from — currently the on-disk shape of
 * `<wrangler-config>/config/default.toml`.
 *
 * Verified against `wrangler@4.90.1` (see `getAuthTokens`
 * in its `wrangler-dist/cli.js`). Keep the field names
 * snake_case to match the TOML wire format.
 */

/**
 * Raw shape of wrangler's auth TOML before any
 * interpretation. All fields are optional because a given
 * file may carry an `oauth_token` (post-`wrangler login`),
 * a legacy `api_token` (v1-style), or neither.
 */
export interface WranglerAuthRaw {
  api_token?: string
  expiration_time?: string
  oauth_token?: string
  refresh_token?: string
  scopes?: readonly string[]
}

/**
 * Validates and returns the input as a {@link WranglerAuthRaw}
 * when its known fields match the expected types; returns
 * `undefined` otherwise. Unknown extra fields are tolerated
 * so the parser keeps working if wrangler adds new keys.
 */
export function asWranglerAuthRaw(value: unknown): undefined | WranglerAuthRaw {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['oauth_token', 'refresh_token', 'expiration_time', 'api_token'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'string') return undefined;
  }
  if (record.scopes !== undefined) {
    if (!Array.isArray(record.scopes)) return undefined;
    if (!record.scopes.every((entry) => typeof entry === 'string')) return undefined;
  }
  return record as WranglerAuthRaw;
}
