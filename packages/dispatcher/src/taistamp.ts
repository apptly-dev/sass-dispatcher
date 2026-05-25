import { parseSecretsToKeys, splitLast } from '@kagal/ed25519-secret';
import { newTaistampHandler, TAISTAMP_PATH } from '@kagal/taistamp';

import type { HandlerBuilder } from './handler-store';
import type { BuildOptions, HostRouter, TaistampOptions } from './types';
import { newHandlerStore } from './handler-store';
import { getValue } from './value';

const buildTaistamp: HandlerBuilder<undefined> = async (secrets) => {
  if (!secrets) {
    return newTaistampHandler();
  }

  const keys = await parseSecretsToKeys(secrets);
  const { last: current } = splitLast(keys);
  if (!current) {
    // Delimiter-only / whitespace-only input parsed to
    // zero usable entries — fall through to unsigned.
    return newTaistampHandler();
  }

  const { selector, signer } = current;
  return newTaistampHandler({ selector, signer });
};

/**
 * Per-isolate cached factory: `taistampHandler(secrets)`
 * returns a {@link Handler} bound to the last entry of
 * the parsed secret list. The input is one or more
 * `selector:base64` secrets separated by whitespace,
 * commas, semicolons, pipes, or any other character
 * outside the `selector:base64` alphabet; the last
 * entry is treated as the current signing key, the
 * leading entries are reserved for rotation (not used
 * for signing).
 *
 * Distinct input strings share the per-isolate Map; the
 * underlying `parseSecretsToKeys` runs once per string.
 *
 * Pass `undefined` or `''` to obtain the unsigned
 * handler — the taistamp library decides per request
 * whether to sign, so the unsigned branch is a real
 * handler, not a disabled stub. A string that contains
 * only delimiters likewise yields the unsigned handler.
 *
 * Strict parsing: a malformed entry rejects the whole
 * call (the underlying `parseSecretsToKeys` defaults to
 * strict mode).
 */
export const taistampHandler = newHandlerStore(buildTaistamp);

export const mountTaistampHandler = <E>(
  router: HostRouter<E>,
  options: TaistampOptions<E>,
  buildOptions: BuildOptions<E>,
): void => {
  // `/.well-known/taistamp` serves the cached handler
  // resolved per request from `options.taistamp`
  // (literal string or env-time accessor); anything
  // under the prefix 404s via `buildOptions.notFound`.
  router.all(TAISTAMP_PATH, (request, env, context) =>
    taistampHandler(getValue(options.taistamp, env))(request, env, context));
  router.all(`${TAISTAMP_PATH}/*`, buildOptions.notFound);
};

export { type Handler } from './types';
export { TAISTAMP_PATH } from '@kagal/taistamp';
