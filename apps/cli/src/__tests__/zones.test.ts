// cspell:words taistamp sunxi
import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../auth';
import { APIError, Client } from '../cf';
import zones from '../commands/zones';
import {
  type Auth,
  type CustomHostname,
  type FallbackOrigin,
  type Zone,
} from '../types';

interface Captured {
  error: string[]
  log: string[]
  stderr: string[]
  stdout: string[]
}

function makeCaptured(): Captured {
  return { log: [], error: [], stdout: [], stderr: [] };
}

function joinMessages(messages: unknown[]): string {
  return messages.map(String).join(' ');
}

function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'zone-1',
    name: 'apptly.me',
    status: 'active',
    ...overrides,
  } as Zone;
}

function makeHostname(overrides: Partial<CustomHostname> = {}): CustomHostname {
  return {
    id: 'ch-1',
    hostname: 'taistamp.org',
    status: 'active',
    ssl: { status: 'active' },
    ...overrides,
  } as CustomHostname;
}

function makeFallback(overrides: Partial<FallbackOrigin> = {}): FallbackOrigin {
  return {
    origin: 'fallback.example.com',
    status: 'active',
    ...overrides,
  } as FallbackOrigin;
}

function makeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    token: 'demo-1234567890-test',
    source: 'env',
    ...overrides,
  };
}

describe('cli zones', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let zonesListSpy: ReturnType<typeof vi.spyOn>;
  let zonesGetSpy: ReturnType<typeof vi.spyOn>;
  let customHostnamesListSpy: ReturnType<typeof vi.spyOn>;
  let fallbackOriginGetSpy: ReturnType<typeof vi.spyOn>;
  let loadAuthSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    captured = makeCaptured();
    savedExitCode = process.exitCode;
    consola.wrapAll();
    consola.mockTypes((type) => vi.fn((...messages: unknown[]) => {
      const line = joinMessages(messages);
      if (type === 'error' || type === 'fatal' || type === 'warn') {
        captured.error.push(line);
      } else {
        captured.log.push(line);
      }
    }));
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: string | Uint8Array) => {
        captured.stdout.push(String(chunk));
        return true;
      },
    );
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(
      (chunk: string | Uint8Array) => {
        captured.stderr.push(String(chunk));
        return true;
      },
    );
    zonesListSpy = vi.spyOn(Client.prototype, 'zonesList');
    zonesGetSpy = vi.spyOn(Client.prototype, 'zonesGet');
    customHostnamesListSpy = vi.spyOn(Client.prototype, 'customHostnamesList');
    customHostnamesListSpy.mockResolvedValue([]);
    fallbackOriginGetSpy = vi.spyOn(Client.prototype, 'fallbackOriginGet');
    fallbackOriginGetSpy.mockResolvedValue(makeFallback());
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    zonesListSpy.mockRestore();
    zonesGetSpy.mockRestore();
    customHostnamesListSpy.mockRestore();
    fallbackOriginGetSpy.mockRestore();
    loadAuthSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('list writes one row per zone to stdout', async () => {
    zonesListSpy.mockResolvedValue([
      makeZone(),
      makeZone({ id: 'zone-2', name: 'taistamp.org', status: 'pending' }),
    ]);

    await runCommand(zones, { rawArgs: ['list'] });

    const output = captured.stdout.join('');
    expect(output).toBe(
      'zone-1 apptly.me active\n' +
      'zone-2 taistamp.org pending\n',
    );
    expect(captured.stderr).toHaveLength(0);
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list warns on empty result via consola without polluting stdout', async () => {
    zonesListSpy.mockResolvedValue([]);

    await runCommand(zones, { rawArgs: ['list'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.stderr).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zones visible to this credential');
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get writes the aggregated zone detail to stdout', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    customHostnamesListSpy.mockResolvedValue([
      makeHostname(),
      makeHostname({
        id: 'ch-2',
        hostname: 'sunxi.apptly.me',
        status: 'pending',
        ssl: { status: 'pending_validation' },
      }),
    ]);
    fallbackOriginGetSpy.mockResolvedValue(makeFallback({
      origin: 'apptly.me',
    }));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(customHostnamesListSpy).toHaveBeenCalledWith('zone-1');
    expect(fallbackOriginGetSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames:\n' +
      '  ch-1 taistamp.org active active\n' +
      '  ch-2 sunxi.apptly.me pending pending_validation\n' +
      'fallback: apptly.me active\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(captured.stderr).toHaveLength(0);
  });

  it('get renders "none" for empty hostnames and "unset" when fallback is 404', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    customHostnamesListSpy.mockResolvedValue([]);
    fallbackOriginGetSpy.mockRejectedValue(new APIError(
      404,
      { errors: [{ code: 1551, message: 'No fallback origin configured' }] },
      'No fallback origin configured',
      {},
    ));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames: none\n' +
      'fallback: unset\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get bubbles a non-404 fallback error and exits non-zero', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    fallbackOriginGetSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access fallback origin' }] },
      'Unauthorized to access fallback origin',
      {},
    ));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access fallback origin');
    expect(process.exitCode).toBe(1);
  });

  it('get exits non-zero when no zone matches the name', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(zones, { rawArgs: ['get', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
    expect(customHostnamesListSpy).not.toHaveBeenCalled();
    expect(fallbackOriginGetSpy).not.toHaveBeenCalled();
  });

  it('list reports a clean APIError and exits non-zero without writing rows', async () => {
    zonesListSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access zones' }] },
      'Unauthorized to access zones',
      {},
    ));

    await runCommand(zones, { rawArgs: ['list'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access zones');
    expect(errorLine).not.toContain('{');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });

  it('list renders "unknown" when a zone status is missing', async () => {
    zonesListSpy.mockResolvedValue([
      makeZone({ id: 'z-x', name: 'no-status.example', status: undefined }),
    ]);

    await runCommand(zones, { rawArgs: ['list'] });

    expect(captured.stdout.join('')).toBe('z-x no-status.example unknown\n');
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list reports the AuthError message and exits non-zero', async () => {
    loadAuthSpy.mockRejectedValue(new AuthError(
      'no-token',
      'no Cloudflare credentials found',
    ));

    await runCommand(zones, { rawArgs: ['list'] });

    expect(captured.error.join('\n'))
      .toContain('no Cloudflare credentials found');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
    expect(zonesListSpy).not.toHaveBeenCalled();
  });

  it('list emits NDJSON envelopes when --json is set', async () => {
    const first = makeZone();
    const second = makeZone({ id: 'zone-2', name: 'taistamp.org', status: 'pending' });
    zonesListSpy.mockResolvedValue([first, second]);

    await runCommand(zones, { rawArgs: ['list', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    );
  });

  it('get emits a composite JSON envelope when --json is set', async () => {
    const zone = makeZone();
    const hostname = makeHostname();
    const fallback = makeFallback({ origin: 'apptly.me' });
    zonesGetSpy.mockResolvedValue(zone);
    customHostnamesListSpy.mockResolvedValue([hostname]);
    fallbackOriginGetSpy.mockResolvedValue(fallback);

    await runCommand(zones, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify({ zone, hostnames: [hostname], fallback })}\n`,
    );
  });

  it('get omits the fallback key in the JSON envelope when no fallback is configured', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    customHostnamesListSpy.mockResolvedValue([]);
    fallbackOriginGetSpy.mockRejectedValue(new APIError(
      404,
      { errors: [{ code: 1551, message: 'No fallback origin configured' }] },
      'No fallback origin configured',
      {},
    ));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify({
        zone: makeZone(),
        hostnames: [],
      })}\n`,
    );
  });
});
