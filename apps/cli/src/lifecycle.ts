import { APIError } from 'cloudflare';

import { AuthError, loadAuth } from './auth';
import { Client } from './cf';
import { fatal } from './exit';
import { type Auth } from './types';

/**
 * Reports a Cloudflare API error in the canonical
 * `[HTTP <status>] <detail>` shape and marks the process as
 * failed. `detail` is the first per-error message from the
 * response envelope, falling back to the synthesised
 * top-level message when CF returns no structured error
 * array.
 */
export function reportAPIError(error: APIError): void {
  const detail = error.errors[0]?.message ?? error.message;
  const status = error.status === undefined ? '' : `[HTTP ${error.status}] `;
  fatal(`${status}${detail}`);
}

/**
 * Standard command lifecycle: resolve credentials, hand the
 * caller a {@link Client} bound to them, and surface the two
 * domain failure modes (`AuthError`, `APIError`) via
 * {@link fatal}. Anything else bubbles to `runMain` for
 * citty's default error handling.
 *
 * Lives outside `cf/` because it's app glue, not part of the
 * Cloudflare abstraction — `Client` describes CF's API and
 * state; this wires that into the CLI's auth pipeline and
 * exit-code conventions.
 *
 * The callback takes a destructured object so call sites can
 * pull only what they need (`({ client })` is the common case
 * — `auth` is only there for source-dependent dispatch) without
 * unused-parameter lint appeasement.
 */
export async function withClient(
  run: (deps: { auth: Auth; client: Client }) => Promise<void>,
): Promise<void> {
  let auth: Auth;
  try {
    auth = await loadAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      fatal(error.message);
      return;
    }
    throw error;
  }

  try {
    await run({ auth, client: new Client(auth) });
  } catch (error) {
    if (error instanceof APIError) {
      reportAPIError(error);
      return;
    }
    throw error;
  }
}
