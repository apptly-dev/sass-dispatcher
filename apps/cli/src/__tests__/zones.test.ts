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
  type FallbackBundle,
  type FallbackOrigin,
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
    accountID: 'acct-9',
    ...overrides,
  };
}

describe('cli zones', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let zonesListSpy: ReturnType<typeof vi.spyOn>;
  let zonesGetSpy: ReturnType<typeof vi.spyOn>;
  let fallbackWithHostnamesSpy: ReturnType<typeof vi.spyOn>;
  let workersRoutesListSpy: ReturnType<typeof vi.spyOn>;
  let workersDomainsListSpy: ReturnType<typeof vi.spyOn>;
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
    fallbackWithHostnamesSpy = vi.spyOn(Client.prototype, 'fallbackWithHostnames');
    fallbackWithHostnamesSpy.mockResolvedValue(makeBundle());
    workersRoutesListSpy = vi.spyOn(Client.prototype, 'workersRoutesList');
    workersRoutesListSpy.mockResolvedValue([]);
    workersDomainsListSpy = vi.spyOn(Client.prototype, 'workersDomainsList');
    workersDomainsListSpy.mockResolvedValue([]);
    loadAuthSpy = vi.spyOn(await import('../auth'), 'loadAuth');
    loadAuthSpy.mockResolvedValue(makeAuth());
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    zonesListSpy.mockRestore();
    zonesGetSpy.mockRestore();
    fallbackWithHostnamesSpy.mockRestore();
    workersRoutesListSpy.mockRestore();
    workersDomainsListSpy.mockRestore();
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
    fallbackWithHostnamesSpy.mockResolvedValue(makeBundle({
      fallback: makeFallback({ origin: 'apptly.me' }),
      hostnames: [
        makeHostname(),
        makeHostname({
          id: 'ch-2',
          hostname: 'sunxi.apptly.me',
          status: 'pending',
          ssl: { status: 'pending_validation' },
        }),
      ],
    }));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(zonesGetSpy).toHaveBeenCalledWith('apptly.me');
    expect(fallbackWithHostnamesSpy).toHaveBeenCalledWith('zone-1');
    expect(workersRoutesListSpy).toHaveBeenCalledWith('zone-1');
    expect(workersDomainsListSpy).toHaveBeenCalledWith('zone-1');
    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames:\n' +
      '  ch-1 taistamp.org active active\n' +
      '  ch-2 sunxi.apptly.me pending pending_validation\n' +
      'fallback: apptly.me active\n' +
      'bindings:\n' +
      '  routes: none\n' +
      '  domains: none\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(captured.stderr).toHaveLength(0);
  });

  it('get expands hostnames into verbose blocks when --hostnames-detail is set', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    fallbackWithHostnamesSpy.mockResolvedValue(makeBundle({
      hostnames: [
        makeHostname({ custom_origin_server: 'minima.linux-sunxi.org' }),
      ],
    }));

    await runCommand(zones, {
      rawArgs: ['get', 'apptly.me', '--hostnames-detail'],
    });

    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames:\n' +
      '  ch-1 taistamp.org\n' +
      '    status: active\n' +
      '    ssl: active\n' +
      '    origin: minima.linux-sunxi.org\n' +
      '    errors: none\n' +
      'fallback: fallback.example.com active\n' +
      'bindings:\n' +
      '  routes: none\n' +
      '  domains: none\n',
    );
  });

  it('get renders "none" for empty hostnames and "unset" when fallback is undefined', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    fallbackWithHostnamesSpy.mockResolvedValue({ fallback: undefined, hostnames: [] });

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames: none\n' +
      'fallback: unset\n' +
      'bindings:\n' +
      '  routes: none\n' +
      '  domains: none\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get renders the bindings section with routes and domains', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    workersRoutesListSpy.mockResolvedValue([
      makeRoute(),
      makeRoute({ id: 'route-2', pattern: '*.apptly.me/*', script: undefined }),
    ]);
    workersDomainsListSpy.mockResolvedValue([
      makeDomain(),
      makeDomain({ id: 'dom-2', hostname: 'taistamp.org', service: 'tenant-worker' }),
    ]);

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames: none\n' +
      'fallback: fallback.example.com active\n' +
      'bindings:\n' +
      '  routes:\n' +
      '    route-1 apptly.me/* dispatcher\n' +
      '    route-2 *.apptly.me/* unknown\n' +
      '  domains:\n' +
      '    dom-1 apptly.me dispatcher\n' +
      '    dom-2 taistamp.org tenant-worker\n',
    );
    expect(captured.error).toHaveLength(0);
  });

  it('get renders domains as "unknown" when CLOUDFLARE_ACCOUNT_ID is unset', async () => {
    loadAuthSpy.mockResolvedValue(makeAuth({ accountID: undefined }));
    zonesGetSpy.mockResolvedValue(makeZone());
    workersRoutesListSpy.mockResolvedValue([makeRoute()]);
    workersDomainsListSpy.mockRejectedValue(new AuthError(
      'no-account',
      'CLOUDFLARE_ACCOUNT_ID not set — Worker Custom Domains needs an account id',
    ));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me'] });

    expect(captured.stdout.join('')).toBe(
      'zone: zone-1 apptly.me active\n' +
      'hostnames: none\n' +
      'fallback: fallback.example.com active\n' +
      'bindings:\n' +
      '  routes:\n' +
      '    route-1 apptly.me/* dispatcher\n' +
      '  domains: unknown (CLOUDFLARE_ACCOUNT_ID unset)\n',
    );
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('get bubbles a SaaS-routing error and exits non-zero', async () => {
    zonesGetSpy.mockResolvedValue(makeZone());
    fallbackWithHostnamesSpy.mockRejectedValue(new APIError(
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
    expect(fallbackWithHostnamesSpy).not.toHaveBeenCalled();
    expect(workersRoutesListSpy).not.toHaveBeenCalled();
    expect(workersDomainsListSpy).not.toHaveBeenCalled();
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
    const route = makeRoute();
    const domain = makeDomain();
    zonesGetSpy.mockResolvedValue(zone);
    fallbackWithHostnamesSpy.mockResolvedValue({ fallback, hostnames: [hostname] });
    workersRoutesListSpy.mockResolvedValue([route]);
    workersDomainsListSpy.mockResolvedValue([domain]);

    await runCommand(zones, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify({
        zone,
        hostnames: [hostname],
        fallback,
        bindings: { routes: [route], domains: [domain] },
      })}\n`,
    );
  });

  it('get omits the fallback and domains keys in the JSON envelope when neither is available', async () => {
    loadAuthSpy.mockResolvedValue(makeAuth({ accountID: undefined }));
    zonesGetSpy.mockResolvedValue(makeZone());
    fallbackWithHostnamesSpy.mockResolvedValue({ fallback: undefined, hostnames: [] });
    workersDomainsListSpy.mockRejectedValue(new AuthError(
      'no-account',
      'CLOUDFLARE_ACCOUNT_ID not set — Worker Custom Domains needs an account id',
    ));

    await runCommand(zones, { rawArgs: ['get', 'apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(
      `${JSON.stringify({
        zone: makeZone(),
        hostnames: [],
        bindings: { routes: [] },
      })}\n`,
    );
  });
});
