// cspell:words taistamp
import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../auth';
import { APIError, Client } from '../cf';
import zones from '../commands/zones';
import { type Auth, type Zone } from '../types';

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
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    zonesListSpy.mockRestore();
    zonesGetSpy.mockRestore();
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

  it('get writes the matching zone row to stdout', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(captured.stdout.join('')).toBe('zone-1 apptly.me active\n');
    expect(captured.error).toHaveLength(0);
    expect(captured.stderr).toHaveLength(0);
  });

  it('get exits non-zero when no zone matches the name', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(zones, { rawArgs: ['get', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
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
});
