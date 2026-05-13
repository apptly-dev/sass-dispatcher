import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { parseTOML } from 'confbox/toml';
import xdgAppPaths from 'xdg-app-paths';

import { AuthError } from './auth';
import { asWranglerAuthRaw, type Auth } from './types';

const WRANGLER_APP_NAME = '.wrangler';
const WRANGLER_AUTH_RELATIVE_PATH = 'config/default.toml';

/**
 * Replicates wrangler's `getGlobalWranglerConfigPath`:
 * legacy `~/.wrangler/` wins if it exists, otherwise the
 * XDG config dir for `.wrangler`.
 */
export function getWranglerConfigDirectory(): string {
  const legacy = path.join(homedir(), WRANGLER_APP_NAME);
  if (existsSync(legacy)) return legacy;
  return xdgAppPaths(WRANGLER_APP_NAME).config();
}

export function getWranglerAuthConfigPath(): string {
  return path.join(getWranglerConfigDirectory(), WRANGLER_AUTH_RELATIVE_PATH);
}

function describeSource(sourcePath: string | undefined): string {
  return sourcePath ?? 'wrangler config';
}

/**
 * Parses wrangler's `default.toml` content and returns the
 * usable credential, or `undefined` if the file is valid
 * TOML but contains no `oauth_token` / `api_token`. Throws
 * `AuthError` for malformed TOML, malformed schema, or an
 * `oauth_token` whose `expiration_time` has passed.
 */
export function parseWranglerAuth(text: string, sourcePath?: string): Auth | undefined {
  let raw: unknown;
  try {
    raw = parseTOML(text);
  } catch (error) {
    throw new AuthError(
      'malformed',
      `${describeSource(sourcePath)} could not be parsed as TOML: ${(error as Error).message}`,
    );
  }

  const config = asWranglerAuthRaw(raw);
  if (config === undefined) {
    throw new AuthError(
      'malformed',
      `${describeSource(sourcePath)} has an unexpected shape`,
    );
  }

  if (config.oauth_token !== undefined && config.oauth_token !== '') {
    let expiresAt: Date | undefined;
    if (config.expiration_time !== undefined) {
      expiresAt = new Date(config.expiration_time);
      if (!Number.isFinite(expiresAt.getTime())) {
        throw new AuthError(
          'malformed',
          `${describeSource(sourcePath)}: expiration_time ${JSON.stringify(config.expiration_time)} is not a parseable date`,
        );
      }
      if (expiresAt.getTime() <= Date.now()) {
        throw new AuthError(
          'expired',
          `wrangler oauth_token expired at ${expiresAt.toISOString()}; run \`wrangler login\` again`,
        );
      }
    }
    return {
      token: config.oauth_token,
      source: 'wrangler',
      configPath: sourcePath,
      scopes: config.scopes,
      expiresAt,
    };
  }

  if (config.api_token !== undefined && config.api_token !== '') {
    return {
      token: config.api_token,
      source: 'wrangler',
      configPath: sourcePath,
    };
  }

  return undefined;
}

/**
 * Reads wrangler's stored credential file. Returns
 * `undefined` if the file is absent or contains no usable
 * token; throws `AuthError` for malformed contents or an
 * expired `oauth_token`.
 */
export async function readWranglerAuth(
  filePath: string = getWranglerAuthConfigPath(),
): Promise<Auth | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseWranglerAuth(text, filePath);
}
