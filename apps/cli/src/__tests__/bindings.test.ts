// cspell:words taistamp
import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../auth';
import { APIError, Client } from '../cf';
import bindings from '../commands/bindings';
import {
  type Auth,
  type WorkersDomain,
  type WorkersRoute,
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

function makeRoute(overrides: Partial<WorkersRoute> = {}): WorkersRoute {
  return {
    id: 'route-1',
    pattern: 'apptly.me/*',
    script: 'dispatcher',
    ...overrides,
  };
}

function makeDomain(overrides: Partial<WorkersDomain> = {}): WorkersDomain {
  return {
    id: 'dom-1',
    cert_id: 'cert-1',
    environment: 'production',
    hostname: 'apptly.me',
    service: 'dispatcher',
    zone_id: 'zone-1',
    zone_name: 'apptly.me',
    ...overrides,
  };
}

function makeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    token: 'demo-1234567890-test',
    source: 'env',
    accountID: 'acct-9',
    ...overrides,
  };
}

describe('cli bindings', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let workersRoutesListSpy: ReturnType<typeof vi.spyOn>;
  let workersDomainsListSpy: ReturnType<typeof vi.spyOn>;
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
    workersRoutesListSpy = vi.spyOn(Client.prototype, 'workersRoutesList');
    workersRoutesListSpy.mockResolvedValue([]);
    workersDomainsListSpy = vi.spyOn(Client.prototype, 'workersDomainsList');
    workersDomainsListSpy.mockResolvedValue([]);
    zonesGetSpy = vi.spyOn(Client.prototype, 'zonesGet');
    zonesGetSpy.mockResolvedValue(makeZone());
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    workersRoutesListSpy.mockRestore();
    workersDomainsListSpy.mockRestore();
    zonesGetSpy.mockRestore();
    loadAuthSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('list writes one row per route and domain, tagged by kind', async () => {
    workersRoutesListSpy.mockResolvedValue([
      makeRoute(),
      makeRoute({ id: 'route-2', pattern: '*.apptly.me/*' }),
    ]);
    workersDomainsListSpy.mockResolvedValue([
      makeDomain(),
      makeDomain({ id: 'dom-2', hostname: 'taistamp.org', service: 'tenant-worker' }),
    ]);

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(workersRoutesListSpy).toHaveBeenCalledWith('zone-1');
    expect(workersDomainsListSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe(
      'route route-1 apptly.me/* dispatcher\n' +
      'route route-2 *.apptly.me/* dispatcher\n' +
      'domain dom-1 apptly.me dispatcher\n' +
      'domain dom-2 taistamp.org tenant-worker\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list emits NDJSON envelopes with kind discriminators when --json is set', async () => {
    const route = makeRoute();
    const domain = makeDomain();
    workersRoutesListSpy.mockResolvedValue([route]);
    workersDomainsListSpy.mockResolvedValue([domain]);

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify({ kind: 'route', ...route })}\n` +
      `${JSON.stringify({ kind: 'domain', ...domain })}\n`,
    );
  });

  it('list renders "unknown" when a route has no script', async () => {
    workersRoutesListSpy.mockResolvedValue([
      makeRoute({ id: 'r-x', pattern: 'orphan.example/*', script: undefined }),
    ]);

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe('route r-x orphan.example/* unknown\n');
  });

  it('list warns and skips domains when CLOUDFLARE_ACCOUNT_ID is unset', async () => {
    loadAuthSpy.mockResolvedValue(makeAuth({ accountID: undefined }));
    workersRoutesListSpy.mockResolvedValue([makeRoute()]);
    // The real Client throws AuthError(no-account) when accountID
    // is missing — simulate that at the spy boundary so the
    // command's catch path runs.
    workersDomainsListSpy.mockRejectedValue(new AuthError(
      'no-account',
      'CLOUDFLARE_ACCOUNT_ID not set — Worker Custom Domains needs an account id',
    ));

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe('route route-1 apptly.me/* dispatcher\n');
    expect(captured.error.join('\n')).toContain(
      'CLOUDFLARE_ACCOUNT_ID not set',
    );
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list warns on empty result via consola without polluting stdout', async () => {
    workersRoutesListSpy.mockResolvedValue([]);
    workersDomainsListSpy.mockResolvedValue([]);

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no worker bindings on apptly.me');
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('list exits non-zero when the zone name does not resolve', async () => {
    zonesGetSpy.mockResolvedValue(undefined);

    await runCommand(bindings, { rawArgs: ['list', 'absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no zone matching absent.example');
    expect(process.exitCode).toBe(1);
    expect(workersRoutesListSpy).not.toHaveBeenCalled();
    expect(workersDomainsListSpy).not.toHaveBeenCalled();
  });

  it('list reports a clean APIError from routes and exits non-zero', async () => {
    workersRoutesListSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access workers routes' }] },
      'Unauthorized to access workers routes',
      {},
    ));

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access workers routes');
    expect(captured.stdout).toHaveLength(0);
    expect(process.exitCode).toBe(1);
  });

  it('list bubbles a non-no-account error from workersDomainsList', async () => {
    workersDomainsListSpy.mockRejectedValue(new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access workers domains' }] },
      'Unauthorized to access workers domains',
      {},
    ));

    await runCommand(bindings, { rawArgs: ['list', 'apptly.me'] });

    const errorLine = captured.error.join('\n');
    expect(errorLine).toContain('[HTTP 403]');
    expect(errorLine).toContain('Unauthorized to access workers domains');
    expect(process.exitCode).toBe(1);
  });
});
