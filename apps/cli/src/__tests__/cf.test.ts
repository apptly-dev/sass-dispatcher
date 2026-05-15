// cspell:words darvaza taistamp
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../auth';
import { APIError, Client } from '../cf';
import { type Auth } from '../types';

const {
  customHostnamesListMock,
  fallbackOriginGetMock,
  sdkConstructorSpy,
  userGetMock,
  verifyMock,
  workersDomainsListMock,
  workersRoutesListMock,
  zonesListMock,
} = vi.hoisted(() => ({
  customHostnamesListMock: vi.fn(),
  fallbackOriginGetMock: vi.fn(),
  sdkConstructorSpy: vi.fn(),
  userGetMock: vi.fn(),
  verifyMock: vi.fn(),
  workersDomainsListMock: vi.fn(),
  workersRoutesListMock: vi.fn(),
  zonesListMock: vi.fn(),
}));

vi.mock('cloudflare', async () => {
  const actual = await vi.importActual<typeof import('cloudflare')>('cloudflare');
  class FakeCloudflare {
    customHostnames: {
      fallbackOrigin: { get: typeof fallbackOriginGetMock }
      list: typeof customHostnamesListMock
    };

    user: { get: typeof userGetMock; tokens: { verify: typeof verifyMock } };
    workers: {
      domains: { list: typeof workersDomainsListMock }
      routes: { list: typeof workersRoutesListMock }
    };

    zones: { list: typeof zonesListMock };
    constructor(options: { apiToken?: string } = {}) {
      sdkConstructorSpy(options);
      this.user = { get: userGetMock, tokens: { verify: verifyMock } };
      this.zones = { list: zonesListMock };
      this.customHostnames = {
        list: customHostnamesListMock,
        fallbackOrigin: { get: fallbackOriginGetMock },
      };
      this.workers = {
        routes: { list: workersRoutesListMock },
        domains: { list: workersDomainsListMock },
      };
    }
  }
  return { ...actual, default: FakeCloudflare };
});

function makeAuth(token: string = 'demo-1234567890-test', accountID?: string): Auth {
  return { token, source: 'env', accountID };
}

function asyncIterableFromArray<T>(items: readonly T[]): AsyncIterable<T> {
  return {
    async* [Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

describe('cf Client', () => {
  beforeEach(() => {
    sdkConstructorSpy.mockClear();
    userGetMock.mockReset();
    verifyMock.mockReset();
    zonesListMock.mockReset();
    customHostnamesListMock.mockReset();
    fallbackOriginGetMock.mockReset();
    workersRoutesListMock.mockReset();
    workersDomainsListMock.mockReset();
  });

  it('constructs the SDK with the auth token and no retries', () => {
    new Client(makeAuth('secret-token'));

    expect(sdkConstructorSpy).toHaveBeenCalledOnce();
    expect(sdkConstructorSpy).toHaveBeenCalledWith(expect.objectContaining({
      apiToken: 'secret-token',
      maxRetries: 0,
    }));
  });

  it('returns the SDK response from tokensVerify()', async () => {
    const expected = {
      id: 'tok-1',
      status: 'active' as const,
      expires_on: '2026-06-01T00:00:00Z',
    };
    verifyMock.mockResolvedValueOnce(expected);

    const result = await new Client(makeAuth()).tokensVerify();

    expect(result).toBe(expected);
    expect(verifyMock).toHaveBeenCalledOnce();
  });

  it('returns the SDK response from userGet()', async () => {
    const expected = {
      id: 'user-1',
      organizations: [{ id: 'org-1', name: 'Apptly Software' }],
    };
    userGetMock.mockResolvedValueOnce(expected);

    const result = await new Client(makeAuth()).userGet();

    expect(result).toBe(expected);
    expect(userGetMock).toHaveBeenCalledOnce();
  });

  it('lets SDK APIErrors bubble out of tokensVerify()', async () => {
    const failure = new APIError(
      401,
      { errors: [{ code: 1000, message: 'Invalid API Token' }] },
      'Invalid API Token',
      {},
    );
    verifyMock.mockRejectedValueOnce(failure);

    await expect(new Client(makeAuth()).tokensVerify()).rejects.toBe(failure);
  });

  it('drains the paginated iterator from zonesList()', async () => {
    const zones = [
      { id: 'zone-1', name: 'apptly.me', status: 'active' },
      { id: 'zone-2', name: 'taistamp.org', status: 'pending' },
      { id: 'zone-3', name: 'darvaza.org', status: 'active' },
    ];
    zonesListMock.mockReturnValueOnce(asyncIterableFromArray(zones));

    const result = await new Client(makeAuth()).zonesList();

    expect(result).toEqual(zones);
    expect(zonesListMock).toHaveBeenCalledOnce();
    expect(zonesListMock).toHaveBeenCalledWith();
  });

  it('queries by name and returns the first match from zonesGet()', async () => {
    const match = { id: 'zone-1', name: 'apptly.me', status: 'active' };
    zonesListMock.mockReturnValueOnce(asyncIterableFromArray([match]));

    const result = await new Client(makeAuth()).zonesGet('apptly.me');

    expect(result).toEqual(match);
    expect(zonesListMock).toHaveBeenCalledWith({ name: 'apptly.me' });
  });

  it('returns undefined from zonesGet() when no zone matches', async () => {
    zonesListMock.mockReturnValueOnce(asyncIterableFromArray([]));

    const result = await new Client(makeAuth()).zonesGet('absent.example');

    expect(result).toBeUndefined();
  });

  it('drains the paginated iterator from customHostnamesList()', async () => {
    const hostnames = [
      { id: 'ch-1', hostname: 'taistamp.org', status: 'active' },
      { id: 'ch-2', hostname: 'example.com', status: 'pending' },
    ];
    customHostnamesListMock.mockReturnValueOnce(asyncIterableFromArray(hostnames));

    const result = await new Client(makeAuth()).customHostnamesList('zone-1');

    expect(result).toEqual(hostnames);
    expect(customHostnamesListMock).toHaveBeenCalledWith({ zone_id: 'zone-1' });
  });

  it('passes the zone_id through to fallbackOriginGet()', async () => {
    const expected = { origin: 'fallback.example.com', status: 'active' };
    fallbackOriginGetMock.mockResolvedValueOnce(expected);

    const result = await new Client(makeAuth()).fallbackOriginGet('zone-1');

    expect(result).toBe(expected);
    expect(fallbackOriginGetMock).toHaveBeenCalledWith({ zone_id: 'zone-1' });
  });

  it('returns the paired fallback and hostnames from fallbackWithHostnames()', async () => {
    const fallback = { origin: 'fallback.example.com', status: 'active' };
    const hostnames = [
      { id: 'ch-1', hostname: 'taistamp.org', status: 'active' },
    ];
    fallbackOriginGetMock.mockResolvedValueOnce(fallback);
    customHostnamesListMock.mockReturnValueOnce(asyncIterableFromArray(hostnames));

    const result = await new Client(makeAuth()).fallbackWithHostnames('zone-1');

    expect(result).toEqual({ fallback, hostnames });
    expect(fallbackOriginGetMock).toHaveBeenCalledWith({ zone_id: 'zone-1' });
    expect(customHostnamesListMock).toHaveBeenCalledWith({ zone_id: 'zone-1' });
  });

  it('swallows a 404 from the fallback endpoint into fallback: undefined', async () => {
    const hostnames = [
      { id: 'ch-1', hostname: 'taistamp.org', status: 'active' },
    ];
    fallbackOriginGetMock.mockRejectedValueOnce(new APIError(
      404,
      { errors: [{ code: 1551, message: 'No fallback origin configured' }] },
      'No fallback origin configured',
      {},
    ));
    customHostnamesListMock.mockReturnValueOnce(asyncIterableFromArray(hostnames));

    const result = await new Client(makeAuth()).fallbackWithHostnames('zone-1');

    expect(result).toEqual({ fallback: undefined, hostnames });
  });

  it('lets a non-404 fallback error bubble out of fallbackWithHostnames()', async () => {
    const failure = new APIError(
      403,
      { errors: [{ code: 9109, message: 'Unauthorized to access fallback origin' }] },
      'Unauthorized to access fallback origin',
      {},
    );
    fallbackOriginGetMock.mockRejectedValueOnce(failure);
    customHostnamesListMock.mockReturnValueOnce(asyncIterableFromArray([]));

    await expect(new Client(makeAuth()).fallbackWithHostnames('zone-1'))
      .rejects.toBe(failure);
  });

  it('drains the paginated iterator from workersRoutesList()', async () => {
    const routes = [
      { id: 'route-1', pattern: 'apptly.me/*', script: 'dispatcher' },
      { id: 'route-2', pattern: '*.apptly.me/*' },
    ];
    workersRoutesListMock.mockReturnValueOnce(asyncIterableFromArray(routes));

    const result = await new Client(makeAuth()).workersRoutesList('zone-1');

    expect(result).toEqual(routes);
    expect(workersRoutesListMock).toHaveBeenCalledWith({ zone_id: 'zone-1' });
  });

  it('passes account_id and zone_id through to workersDomainsList()', async () => {
    const domains = [
      {
        id: 'dom-1',
        cert_id: 'cert-1',
        environment: 'production',
        hostname: 'apptly.me',
        service: 'dispatcher',
        zone_id: 'zone-1',
        zone_name: 'apptly.me',
      },
    ];
    workersDomainsListMock.mockReturnValueOnce(asyncIterableFromArray(domains));

    const result = await new Client(
      makeAuth('demo-1234567890-test', 'acct-9'),
    ).workersDomainsList('zone-1');

    expect(result).toEqual(domains);
    expect(workersDomainsListMock).toHaveBeenCalledWith({
      account_id: 'acct-9',
      zone_id: 'zone-1',
    });
  });

  it('rejects workersDomainsList() with AuthError(no-account) when account_id is unset', async () => {
    const promise = new Client(makeAuth()).workersDomainsList('zone-1');

    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: 'no-account',
      message: expect.stringContaining('CLOUDFLARE_ACCOUNT_ID'),
    });
    expect(workersDomainsListMock).not.toHaveBeenCalled();
  });
});
