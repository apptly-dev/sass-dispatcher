/**
 * Resolved Cloudflare credential surface returned by
 * `loadAuth()` and the wrangler-borrow helpers. Pure type
 * declarations only — the `AuthError` class and the
 * `loadAuth` runtime live in `../auth.ts`.
 */

export type AuthSource = 'env' | 'wrangler';

export interface Auth {
  readonly configPath?: string
  readonly expiresAt?: Date
  readonly scopes?: readonly string[]
  readonly source: AuthSource
  readonly token: string
}

export type AuthErrorCode = 'expired' | 'malformed' | 'no-token';
