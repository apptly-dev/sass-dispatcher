import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import whoami from '../commands/whoami';
import {
  type Auth,
  type TokenVerifyResponse,
  type UserGetResponse,
} from '../types';

interface Captured {
  error: string[]
  log: string[]
}

function makeCaptured(): Captured {
  return { log: [], error: [] };
}

function joinMessages(messages: unknown[]): string {
  return messages.map(String).join(' ');
}

function makeVerified(overrides: Partial<TokenVerifyResponse> = {}): TokenVerifyResponse {
  return { id: 'tok-1', status: 'active', ...overrides };
}

function makeUser(overrides: Partial<UserGetResponse> = {}): UserGetResponse {
  return {
    id: 'user-1',
    organizations: [{ id: 'org-1', name: 'Apptly Software' }],
    ...overrides,
  };
}

function makeWranglerAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    token: 'oauth-wrangler-1234567890-test',
    source: 'wrangler',
    configPath: '/fake/wrangler/config.toml',
    scopes: ['ssl_certs:write', 'zone:read'],
    expiresAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

describe('cli whoami', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let verifySpy: ReturnType<typeof vi.spyOn>;
  let userGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captured = makeCaptured();
    savedExitCode = process.exitCode;
    consola.wrapAll();
    consola.mockTypes((type) => vi.fn((...messages: unknown[]) => {
      const line = joinMessages(messages);
      if (type === 'error' || type === 'fatal') {
        captured.error.push(line);
      } else {
        captured.log.push(line);
      }
    }));
    verifySpy = vi.spyOn(Client.prototype, 'tokensVerify');
    userGetSpy = vi.spyOn(Client.prototype, 'userGet');
  });

  afterEach(() => {
    consola.restoreAll();
    verifySpy.mockRestore();
    userGetSpy.mockRestore();
    // cspell:disable-next-line
    vi.unstubAllEnvs();
    process.exitCode = savedExitCode;
  });

  it('env source calls tokensVerify and reports token id + status', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'demo-1234567890-test');
    verifySpy.mockResolvedValue(makeVerified({ expires_on: '2026-06-01T00:00:00Z' }));

    await runCommand(whoami, { rawArgs: [] });

    const output = captured.log.join('\n');
    expect(output).toContain('authenticated via env — token active');
    expect(output).toContain('token id: tok-1');
    expect(output).toContain('expires:');
    expect(output).toContain('2026-06-01T00:00:00Z');
    expect(output).not.toContain('demo-1234567890-test');
    expect(userGetSpy).not.toHaveBeenCalled();
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('--verbose on env source adds masked token but never the full token', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'demo-1234567890-test');
    verifySpy.mockResolvedValue(makeVerified());

    await runCommand(whoami, { rawArgs: ['--verbose'] });

    const output = captured.log.join('\n');
    expect(output).toContain('authenticated via env');
    expect(output).toContain('token:');
    expect(output).toContain('demo');
    expect(output).toContain('test');
    expect(output).not.toContain('demo-1234567890-test');
  });

  it('wrangler source calls userGet and reports user id + primary org', async () => {
    const wranglerSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    try {
      wranglerSpy.mockResolvedValue(makeWranglerAuth());
      userGetSpy.mockResolvedValue(makeUser());

      await runCommand(whoami, { rawArgs: [] });

      const output = captured.log.join('\n');
      expect(output).toContain('authenticated via wrangler');
      expect(output).toContain('user id:');
      expect(output).toContain('user-1');
      expect(output).toContain('organization: Apptly Software');
      expect(verifySpy).not.toHaveBeenCalled();
      expect(captured.error).toHaveLength(0);
    } finally {
      wranglerSpy.mockRestore();
    }
  });

  it('exits non-zero with AuthError text when no credentials resolve', async () => {
    const fakeHome = mkdtempSync(path.join(tmpdir(), 'sass-dispatcher-whoami-'));
    try {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
      vi.stubEnv('HOME', fakeHome);
      vi.stubEnv('XDG_CONFIG_HOME', '');

      await runCommand(whoami, { rawArgs: [] });

      expect(captured.error.join('\n')).toContain('no Cloudflare credentials');
      expect(process.exitCode).toBe(1);
      expect(verifySpy).not.toHaveBeenCalled();
      expect(userGetSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('reports a clean APIError message (not the full envelope) and exits non-zero', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'demo-1234567890-test');
    verifySpy.mockRejectedValue(new APIError(
      401,
      { errors: [{ code: 1000, message: 'Invalid API Token' }] },
      'Invalid API Token',
      {},
    ));

    await runCommand(whoami, { rawArgs: [] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 401]');
    expect(errorLine).toContain('Invalid API Token');
    expect(errorLine).not.toContain('"success"');
    expect(errorLine).not.toContain('{');
    expect(process.exitCode).toBe(1);
  });
});
