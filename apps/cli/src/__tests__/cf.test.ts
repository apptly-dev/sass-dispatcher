// cspell:words darvaza taistamp
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import { type Auth } from '../types';

const {
  customHostnamesListMock,
  fallbackOriginGetMock,
  sdkConstructorSpy,
  userGetMock,
  verifyMock,
  zonesListMock,
} = vi.hoisted(() => ({
  customHostnamesListMock: vi.fn(),
  fallbackOriginGetMock: vi.fn(),
  sdkConstructorSpy: vi.fn(),
  userGetMock: vi.fn(),
  verifyMock: vi.fn(),
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
    zones: { list: typeof zonesListMock };
    constructor(options: { apiToken?: string } = {}) {
      sdkConstructorSpy(options);
      this.user = { get: userGetMock, tokens: { verify: verifyMock } };
      this.zones = { list: zonesListMock };
      this.customHostnames = {
        list: customHostnamesListMock,
        fallbackOrigin: { get: fallbackOriginGetMock },
      };
    }
  }
  return { ...actual, default: FakeCloudflare };
});

function makeAuth(token: string = 'demo-1234567890-test'): Auth {
  return { token, source: 'env' };
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
});
