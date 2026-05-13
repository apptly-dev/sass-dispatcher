import Cloudflare from 'cloudflare';

import {
  type Auth,
  type TokenVerifyResponse,
  type UserGetResponse,
} from './types';

export { APIError } from 'cloudflare';

/**
 * Higher-level Cloudflare client. Owns the SDK instance,
 * narrows its surface to the operations this CLI uses, and
 * gives us a single seam to evolve (caching, retries, logging)
 * without changing every call site.
 *
 * `tokensVerify` (`GET /user/tokens/verify`) only accepts CF
 * API tokens. Wrangler OAuth bearers are rejected there — use
 * `userGet` (`GET /user`) for those.
 */
export class Client {
  readonly #raw: Cloudflare;

  constructor(auth: Auth) {
    this.#raw = new Cloudflare({
      apiToken: auth.token,
      maxRetries: 0,
    });
  }

  tokensVerify(): Promise<TokenVerifyResponse> {
    return this.#raw.user.tokens.verify();
  }

  userGet(): Promise<UserGetResponse> {
    return this.#raw.user.get();
  }
}
