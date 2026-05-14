import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import fallback from '../commands/fallback';
import { type Auth, type FallbackOrigin, type Zone } from '../types';

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
  let fallbackOriginGetSpy: ReturnType<typeof vi.spyOn>;
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
    fallbackOriginGetSpy = vi.spyOn(Client.prototype, 'fallbackOriginGet');
    zonesGetSpy = vi.spyOn(Client.prototype, 'zonesGet');
    zonesGetSpy.mockResolvedValue(makeZone());
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    fallbackOriginGetSpy.mockRestore();
    zonesGetSpy.mockRestore();
    loadAuthSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('get writes the fallback origin and status to stdout', async () => {
    fallbackOriginGetSpy.mockResolvedValue(makeFallback());

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(fallbackOriginGetSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe('fallback.example.com active\n');
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get emits the full JSON envelope when --json is set', async () => {
    const envelope = makeFallback({ created_at: '2026-05-01T00:00:00Z' });
    fallbackOriginGetSpy.mockResolvedValue(envelope);

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(`${JSON.stringify(envelope)}\n`);
  });

  it('get renders "unset" when no origin is configured', async () => {
    fallbackOriginGetSpy.mockResolvedValue(makeFallback({
      origin: undefined,
      status: undefined,
    }));

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe('unset unknown\n');
  });

  it('get exits non-zero when the zone name does not resolve', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(fallback, { rawArgs: ['get', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
    expect(fallbackOriginGetSpy).not.toHaveBeenCalled();
  });

  it('get reports a clean APIError 404 when no fallback is configured', async () => {
    fallbackOriginGetSpy.mockRejectedValue(new APIError(
      404,
      { errors: [{ code: 1551, message: 'No fallback origin configured' }] },
      'No fallback origin configured',
      {},
    ));

    await runCommand(fallback, { rawArgs: ['get', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 404]');
    expect(errorLine).toContain('No fallback origin configured');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });
});
