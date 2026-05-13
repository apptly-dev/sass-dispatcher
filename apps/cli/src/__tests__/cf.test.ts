import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, Client } from '../cf';
import { type Auth } from '../types';

const { sdkConstructorSpy, userGetMock, verifyMock } = vi.hoisted(() => ({
  sdkConstructorSpy: vi.fn(),
  userGetMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock('cloudflare', async () => {
  const actual = await vi.importActual<typeof import('cloudflare')>('cloudflare');
  class FakeCloudflare {
    user: { get: typeof userGetMock; tokens: { verify: typeof verifyMock } };
    constructor(options: { apiToken?: string } = {}) {
      sdkConstructorSpy(options);
      this.user = { get: userGetMock, tokens: { verify: verifyMock } };
    }
  }
  return { ...actual, default: FakeCloudflare };
});

function makeAuth(token: string = 'demo-1234567890-test'): Auth {
  return { token, source: 'env' };
}

describe('cf Client', () => {
  beforeEach(() => {
    sdkConstructorSpy.mockClear();
    userGetMock.mockReset();
    verifyMock.mockReset();
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
});
