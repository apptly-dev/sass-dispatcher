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
 */
export async function loadAuth(): Promise<Auth> {
  const envToken = process.env.CLOUDFLARE_API_TOKEN;
  if (envToken !== undefined && envToken !== '') {
    return { token: envToken, source: 'env' };
  }

  const wrangler = await readWranglerAuth();
  if (wrangler !== undefined) return wrangler;

  throw new AuthError(
    'no-token',
    'no Cloudflare credentials found — set CLOUDFLARE_API_TOKEN or run `wrangler login`',
  );
}
