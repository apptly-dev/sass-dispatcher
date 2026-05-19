import { describe, expect, it } from 'vitest';

import { TAISTAMP_PATH, taistampHandler } from '../taistamp';

const TEST_SELECTOR = 'test';
// 32 zero bytes, RFC 4648 §4 base64 (43 'A' + 1 '=').
const TEST_SEED_B64 = `${'A'.repeat(43)}=`;
const TEST_SECRET = `${TEST_SELECTOR}:${TEST_SEED_B64}`;

const url = `https://example.com${TAISTAMP_PATH}`;

// Type-only cast — at runtime the object is a plain
// Request with no `cf` envelope. Fine while the SUT
// only reads url/headers/method.
const newIncoming = (
  input: string,
  init?: RequestInit,
): Request<unknown, IncomingRequestCfProperties> =>
  new Request(input, init) as unknown as Request<
    unknown,
    IncomingRequestCfProperties
  >;

const encodeBase64 = (bytes: Uint8Array): string => {
  let s = '';
  // eslint-disable-next-line unicorn/prefer-code-point -- operating on bytes, not code points
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const makeNonceHeader = (length = 16): string => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = i + 1;
  return `:${encodeBase64(bytes)}:`;
};

const decodeAscii = (buffer: ArrayBuffer): string =>
  new TextDecoder('ascii').decode(buffer);

describe('taistampHandler', () => {
  it('exposes the canonical taistamp path', () => {
    expect(TAISTAMP_PATH).toBe('/.well-known/taistamp');
  });

  it('produces an unsigned response when called with undefined', async () => {
    const response = await taistampHandler(undefined)(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('tai-key-selector')).toBeNull();
    expect(response.headers.get('tai-signature')).toBeNull();

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(25);
    expect(decodeAscii(body)).toMatch(/^@[0-9a-f]{24}$/);
  });

  it('treats an empty-string secret as unsigned', async () => {
    const response = await taistampHandler('')(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('tai-key-selector')).toBeNull();
    expect(response.headers.get('tai-signature')).toBeNull();
  });

  it('signs the response when called with a valid secret', async () => {
    const response = await taistampHandler(TEST_SECRET)(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('tai-key-selector')).toBe(TEST_SELECTOR);
    const sig = response.headers.get('tai-signature');
    expect(sig).not.toBeNull();
    expect(sig).toMatch(/^:[A-Za-z0-9+/=]+:$/);
  });

  it('does not sign when the request omits TAI-Nonce', async () => {
    const response = await taistampHandler(TEST_SECRET)(
      newIncoming(url),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('tai-key-selector')).toBeNull();
    expect(response.headers.get('tai-signature')).toBeNull();
  });

  it('keeps distinct secrets keyed separately', async () => {
    const altSelector = 'rotate';
    const altSecret = `${altSelector}:${TEST_SEED_B64}`;

    const r1 = await taistampHandler(TEST_SECRET)(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );
    const r2 = await taistampHandler(altSecret)(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(r1.headers.get('tai-key-selector')).toBe(TEST_SELECTOR);
    expect(r2.headers.get('tai-key-selector')).toBe(altSelector);
  });

  it('signs with the last entry when given a multi-secret string', async () => {
    const previousSelector = 'old';
    const currentSelector = 'new';
    const multi = [
      `${previousSelector}:${TEST_SEED_B64}`,
      `${currentSelector}:${TEST_SEED_B64}`,
    ].join(' ');

    const response = await taistampHandler(multi)(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('tai-key-selector')).toBe(currentSelector);
  });

  it('treats a delimiter-only string as unsigned', async () => {
    const response = await taistampHandler('   ,;|  ')(
      newIncoming(url, { headers: { 'tai-nonce': makeNonceHeader() } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('tai-key-selector')).toBeNull();
    expect(response.headers.get('tai-signature')).toBeNull();
  });

  it('rejects a malformed entry in strict mode', async () => {
    await expect(
      taistampHandler(`${TEST_SECRET} not-a-secret`)(newIncoming(url)),
    ).rejects.toThrow(TypeError);
  });
});
