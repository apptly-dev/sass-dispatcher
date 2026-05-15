// cspell:words sunxi taistamp
import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import fallback from '../commands/fallback';
import {
  type Auth,
  type CustomHostname,
  type FallbackBundle,
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

function makeFallback(overrides: Partial<FallbackOrigin> = {}): FallbackOrigin {
  return {
    origin: 'fallback.example.com',
    status: 'active',
    ...overrides,
  } as FallbackOrigin;
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

function makeBundle(overrides: Partial<FallbackBundle> = {}): FallbackBundle {
  return {
    fallback: makeFallback(),
    hostnames: [],
    ...overrides,
  };
}

function makeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    token: 'demo-1234567890-test',
    source: 'env',
    ...overrides,
  };
}

describe('cli fallback', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let fallbackWithHostnamesSpy: ReturnType<typeof vi.spyOn>;
  let zonesGetSpy: ReturnType<typeof vi.spyOn>;
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
    fallbackWithHostnamesSpy = vi.spyOn(Client.prototype, 'fallbackWithHostnames');
    zonesGetSpy = vi.spyOn(Client.prototype, 'zonesGet');
    zonesGetSpy.mockResolvedValue(makeZone());
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    fallbackWithHostnamesSpy.mockRestore();
    zonesGetSpy.mockRestore();
    loadAuthSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('get writes the fallback line and verbose hostnames to stdout', async () => {
    fallbackWithHostnamesSpy.mockResolvedValue(makeBundle({
      hostnames: [
        makeHostname({ custom_origin_server: 'minima.linux-sunxi.org' }),
        makeHostname({
          id: 'ch-2',
          hostname: 'example.com',
          status: 'pending',
          ssl: { status: 'pending_validation' },
        }),
      ],
    }));

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(fallbackWithHostnamesSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe(
      'hostnames:\n' +
      '  ch-1 taistamp.org\n' +
      '    status: active\n' +
      '    ssl: active\n' +
      '    origin: minima.linux-sunxi.org\n' +
      '    errors: none\n' +
      '  ch-2 example.com\n' +
      '    status: pending\n' +
      '    ssl: pending_validation\n' +
      '    origin: → fallback\n' +
      '    errors: none\n' +
      'fallback: fallback.example.com active\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get emits the composite bundle envelope when --json is set', async () => {
    const bundle = makeBundle({ hostnames: [makeHostname()] });
    fallbackWithHostnamesSpy.mockResolvedValue(bundle);

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(`${JSON.stringify(bundle)}\n`);
  });

  it('get renders "fallback: unset" and "hostnames: none" on an empty zone', async () => {
    fallbackWithHostnamesSpy.mockResolvedValue({ fallback: undefined, hostnames: [] });

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe(
      'hostnames: none\n' +
      'fallback: unset\n',
    );
  });

  it('get exits non-zero when the zone name does not resolve', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(fallback, { rawArgs: ['get', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
    expect(fallbackWithHostnamesSpy).not.toHaveBeenCalled();
  });

  it('get reports a clean APIError and exits non-zero', async () => {
    fallbackWithHostnamesSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access custom hostnames' }] },
      'Unauthorized to access custom hostnames',
      {},
    ));

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access custom hostnames');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
