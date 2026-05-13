import { describe, expect, it } from 'vitest';

import { AuthError } from '../auth';
import { parseWranglerAuth } from '../wrangler';

const FUTURE_ISO = '2099-01-01T00:00:00.000Z';
const PAST_ISO = '2000-01-01T00:00:00.000Z';

describe('parseWranglerAuth', () => {
  it('returns the oauth_token with scopes and expiresAt', () => {
    const toml = [
      'oauth_token = "fake-oauth-token"',
      'refresh_token = "fake-refresh"',
      `expiration_time = "${FUTURE_ISO}"`,
      'scopes = ["account:read", "ssl_certs:write"]',
      '',
    ].join('\n');

    const auth = parseWranglerAuth(toml, '/fake/path/default.toml');

    expect(auth).toBeDefined();
    expect(auth?.source).toBe('wrangler');
    expect(auth?.token).toBe('fake-oauth-token');
    expect(auth?.configPath).toBe('/fake/path/default.toml');
    expect(auth?.scopes).toEqual(['account:read', 'ssl_certs:write']);
    expect(auth?.expiresAt?.toISOString()).toBe(FUTURE_ISO);
  });

  it('throws AuthError(expired) when expiration_time has passed', () => {
    const toml = [
      'oauth_token = "fake-oauth-token"',
      `expiration_time = "${PAST_ISO}"`,
      'scopes = []',
      '',
    ].join('\n');

    let caught: unknown;
    try {
      parseWranglerAuth(toml);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('expired');
  });

  it('treats oauth_token without expiration_time as valid', () => {
    const auth = parseWranglerAuth('oauth_token = "tok"\n');

    expect(auth?.token).toBe('tok');
    expect(auth?.expiresAt).toBeUndefined();
  });

  it('falls back to api_token when oauth_token is absent', () => {
    const auth = parseWranglerAuth('api_token = "legacy-key"\n', '/fake/default.toml');

    expect(auth?.token).toBe('legacy-key');
    expect(auth?.source).toBe('wrangler');
    expect(auth?.scopes).toBeUndefined();
    expect(auth?.expiresAt).toBeUndefined();
  });

  it('returns null for valid TOML that holds no usable token', () => {
    const auth = parseWranglerAuth('scopes = []\n');

    expect(auth).toBeUndefined();
  });

  it('throws AuthError(malformed) for invalid TOML', () => {
    let caught: unknown;
    try {
      parseWranglerAuth('this is not = valid toml :: at all');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('malformed');
  });

  it('throws AuthError(malformed) when oauth_token type is wrong', () => {
    let caught: unknown;
    try {
      parseWranglerAuth('oauth_token = 42\n');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('malformed');
  });

  it('throws AuthError(malformed) when expiration_time is not a date', () => {
    let caught: unknown;
    try {
      parseWranglerAuth(
        ['oauth_token = "t"', 'expiration_time = "not-a-date"', ''].join('\n'),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthError);
    expect((caught as AuthError).code).toBe('malformed');
  });
});
