import { type Auth, type AuthErrorCode } from './types';
import { readWranglerAuth } from './wrangler';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * Resolves Cloudflare credentials by trying, in order:
 * `CLOUDFLARE_API_TOKEN` env var, then wrangler's stored
 * OAuth token. Throws `AuthError('no-token')` when neither
 * resolves — the caller is expected to fall back to the
 * show-URL-and-prompt flow at that point.
 *
 * The optional `accountID` field is read from
 * `CLOUDFLARE_ACCOUNT_ID` and attached to both credential
 * sources when present. Account-scoped operations (Worker
 * Custom Domains, dispatch namespaces) require it. This
 * iteration only reads the env; auto-resolution from the
 * API is on the roadmap but not yet wired — set it in
 * `.env` or those operations skip with a warning.
 */
export async function loadAuth(): Promise<Auth> {
  const accountID = readEnvAccountID();

  const envToken = process.env.CLOUDFLARE_API_TOKEN;
  if (envToken !== undefined && envToken !== '') {
    return { token: envToken, source: 'env', accountID };
  }

  const wrangler = await readWranglerAuth();
  if (wrangler !== undefined) return { ...wrangler, accountID };

  throw new AuthError(
    'no-token',
    'no Cloudflare credentials found — set CLOUDFLARE_API_TOKEN or run `wrangler login`',
  );
}

function readEnvAccountID(): string | undefined {
  const value = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (value === undefined || value === '') return undefined;
  return value;
}
