import { defineCommand } from 'citty';
import { consola } from 'consola';

import { AuthError, loadAuth } from '../auth';
import { APIError, Client } from '../cf';
import {
  type Auth,
  type TokenVerifyResponse,
  type UserGetResponse,
} from '../types';

function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function reportVerbose(auth: Auth): void {
  consola.log(`  token:   ${maskToken(auth.token)}`);
  if (auth.configPath !== undefined) {
    consola.log(`  config:  ${auth.configPath}`);
  }
  if (auth.scopes !== undefined && auth.scopes.length > 0) {
    consola.log('  scopes:');
    for (const scope of auth.scopes) {
      consola.log(`    - ${scope}`);
    }
  }
  if (auth.expiresAt !== undefined) {
    consola.log(`  expires: ${auth.expiresAt.toISOString()}`);
  }
}

function reportToken(auth: Auth, verified: TokenVerifyResponse): void {
  consola.log(`authenticated via ${auth.source} — token ${verified.status}`);
  consola.log(`  token id: ${verified.id}`);
  if (verified.expires_on !== undefined) {
    consola.log(`  expires:  ${verified.expires_on}`);
  }
}

function reportUser(auth: Auth, user: UserGetResponse): void {
  consola.log(`authenticated via ${auth.source}`);
  if (user.id !== undefined) {
    consola.log(`  user id:      ${user.id}`);
  }
  const primaryOrg = user.organizations?.[0];
  if (primaryOrg !== undefined) {
    consola.log(`  organization: ${primaryOrg.name}`);
  }
}

function reportAPIError(error: APIError): void {
  const detail = error.errors[0]?.message ?? error.message;
  const status = error.status === undefined ? '' : `[HTTP ${error.status}] `;
  consola.error(`${status}${detail}`);
}

/**
 * `cli whoami` — resolves the active Cloudflare credentials
 * via {@link loadAuth} and verifies them against the API. The
 * endpoint depends on the credential type: API tokens (env)
 * go through `GET /user/tokens/verify`; wrangler-borrowed
 * OAuth bearers use `GET /user`. With `--verbose`, the
 * credential source is dumped (config path, scopes, local
 * expiry).
 */
export default defineCommand({
  meta: {
    name: 'whoami',
    description: 'Resolve and verify the active Cloudflare credentials',
  },
  args: {
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Print the resolved source, config path, scopes, and expiry',
      default: false,
    },
  },
  run: async ({ args }) => {
    let auth: Auth;
    try {
      auth = await loadAuth();
    } catch (error) {
      if (error instanceof AuthError) {
        consola.error(error.message);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    const client = new Client(auth);
    try {
      if (auth.source === 'env') {
        reportToken(auth, await client.tokensVerify());
      } else {
        reportUser(auth, await client.userGet());
      }
    } catch (error) {
      if (error instanceof APIError) {
        reportAPIError(error);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    if (args.verbose) reportVerbose(auth);
  },
});
