import Cloudflare from 'cloudflare';

import { AuthError } from '../auth';
import {
  type Auth,
  type CustomHostname,
  type FallbackOrigin,
  type TokenVerifyResponse,
  type UserGetResponse,
  type WorkersDomain,
  type WorkersRoute,
  type Zone,
} from '../types';
import * as customHostnames from './custom-hostnames';
import * as fallbackOrigin from './fallback-origin';
import * as workersDomains from './workers-domains';
import * as workersRoutes from './workers-routes';
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
  readonly #accountID: string | undefined;
  readonly #raw: Cloudflare;

  constructor(auth: Auth) {
    this.#raw = new Cloudflare({
      apiToken: auth.token,
      maxRetries: 0,
    });
    this.#accountID = auth.accountID;
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

  customHostnamesList(zoneID: string): Promise<CustomHostname[]> {
    return customHostnames.list(this.#raw, zoneID);
  }

  fallbackOriginGet(zoneID: string): Promise<FallbackOrigin> {
    return fallbackOrigin.get(this.#raw, zoneID);
  }

  workersRoutesList(zoneID: string): Promise<WorkersRoute[]> {
    return workersRoutes.list(this.#raw, zoneID);
  }

  /**
   * Lists Worker Custom Domains for the credential's account
   * filtered to one zone. Worker Custom Domains is
   * account-scoped, so this rejects with
   * `AuthError('no-account')` when no `accountID` is bound;
   * auto-resolving the account is on the roadmap but not yet
   * wired (see {@link loadAuth}).
   */
  async workersDomainsList(zoneID: string): Promise<WorkersDomain[]> {
    if (this.#accountID === undefined) {
      throw new AuthError(
        'no-account',
        'CLOUDFLARE_ACCOUNT_ID not set — Worker Custom Domains needs an account id',
      );
    }
    return workersDomains.list(this.#raw, this.#accountID, zoneID);
  }
}

export { APIError } from 'cloudflare';
