import Cloudflare from 'cloudflare';

import {
  type Auth,
  type TokenVerifyResponse,
  type UserGetResponse,
  type Zone,
} from '../types';
import * as zones from './zones';

/**
 * Higher-level Cloudflare client. Owns the SDK instance and
 * narrows its surface to the operations this CLI uses, giving
 * a single seam to evolve (caching, retries, request shaping)
 * without changing every call site.
 *
 * Does not log. Methods return values or throw — consumers
 * (commands, `withClient`) decide how failures surface to the
 * user. Keeps `Client` agnostic of how it's invoked.
 *
 * Non-trivial method bodies live in sibling resource modules
 * (`./zones`, etc.) as pure functions taking the SDK
 * instance, so they can be unit-tested without constructing
 * a `Client`. `Client` itself just wires auth to those
 * helpers.
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

  zonesList(): Promise<Zone[]> {
    return zones.list(this.#raw);
  }

  zonesGet(name: string): Promise<undefined | Zone> {
    return zones.get(this.#raw, name);
  }
}

export { APIError } from 'cloudflare';
