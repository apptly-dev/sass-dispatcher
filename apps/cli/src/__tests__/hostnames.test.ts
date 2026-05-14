// cspell:words taistamp
import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import hostnames from '../commands/hostnames';
import { type Auth, type CustomHostname, type Zone } from '../types';

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

function makeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    token: 'demo-1234567890-test',
    source: 'env',
    ...overrides,
  };
}

describe('cli hostnames', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let customHostnamesListSpy: ReturnType<typeof vi.spyOn>;
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
    customHostnamesListSpy = vi.spyOn(Client.prototype, 'customHostnamesList');
    zonesGetSpy = vi.spyOn(Client.prototype, 'zonesGet');
    zonesGetSpy.mockResolvedValue(makeZone());
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    customHostnamesListSpy.mockRestore();
    zonesGetSpy.mockRestore();
    loadAuthSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('list writes one row per hostname to stdout', async () => {
    customHostnamesListSpy.mockResolvedValue([
      makeHostname(),
      makeHostname({
        id: 'ch-2',
        hostname: 'example.com',
        status: 'pending',
        ssl: { status: 'pending_validation' },
      }),
    ]);

    await runCommand(hostnames, { rawArgs: ['list', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(customHostnamesListSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe(
      'ch-1 taistamp.org active active\n' +
      'ch-2 example.com pending pending_validation\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list emits NDJSON envelopes when --json is set', async () => {
    const first = makeHostname();
    const second = makeHostname({ id: 'ch-2', hostname: 'example.com' });
    customHostnamesListSpy.mockResolvedValue([first, second]);

    await runCommand(hostnames, { rawArgs: ['list', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    );
  });

  it('list renders "unknown" when hostname status or ssl status is missing', async () => {
    customHostnamesListSpy.mockResolvedValue([
      makeHostname({ id: 'ch-x', status: undefined, ssl: undefined }),
    ]);

    await runCommand(hostnames, { rawArgs: ['list', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe('ch-x taistamp.org unknown unknown\n');
  });

  it('list warns on empty result via consola without polluting stdout', async () => {
    customHostnamesListSpy.mockResolvedValue([]);

    await runCommand(hostnames, { rawArgs: ['list', 'apptly.me'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no custom hostnames in apptly.me');
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list exits non-zero when the zone name does not resolve', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(hostnames, { rawArgs: ['list', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
    expect(customHostnamesListSpy).not.toHaveBeenCalled();
  });

  it('list reports a clean APIError and exits non-zero', async () => {
    customHostnamesListSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access custom hostnames' }] },
      'Unauthorized to access custom hostnames',
      {},
    ));

    await runCommand(hostnames, { rawArgs: ['list', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access custom hostnames');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
