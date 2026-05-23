import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const makeNonceHeader = (): string => {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1;
  let s = '';
  // eslint-disable-next-line unicorn/prefer-code-point -- operating on bytes, not code points
  for (const b of bytes) s += String.fromCharCode(b);
  return `:${btoa(s)}:`;
};

describe('worker fetch (workerd pool)', () => {
  it('serves the branded fallback for an unknown host', async () => {
    const response = await SELF.fetch(
      'https://not-allowlisted.test/.well-known/taistamp',
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('sass-dispatcher (stub)\n');
  });

  it('serves an unsigned TAI64N label at /.well-known/taistamp', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
    expect(response.headers.get('content-length')).toBe('25');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('tai-leap-seconds')).not.toBeNull();
    // Request omits `TAI-Nonce`, so the response is unsigned
    // per spec §5.2 regardless of whether a secret is bound.
    expect(response.headers.get('tai-signature')).toBeNull();
    expect(response.headers.get('tai-key-selector')).toBeNull();

    // `application/tai64n` is officially binary; decode the
    // 25 bytes via TextDecoder so workerd doesn't warn about
    // `.text()` on a non-text Content-Type.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toHaveLength(25);
    expect(new TextDecoder('ascii').decode(bytes)).toMatch(/^@[\da-f]{24}$/);
  });

  it('answers HEAD at /.well-known/taistamp with the GET headers and no body', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp',
      { method: 'HEAD' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
    expect(response.headers.get('content-length')).toBe('25');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('tai-leap-seconds')).not.toBeNull();
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toHaveLength(0);
  });

  it('answers OPTIONS at /.well-known/taistamp with the allowed methods', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp',
      { method: 'OPTIONS' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });

  it('rejects unsupported methods at /.well-known/taistamp with 405', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp',
      { method: 'POST' },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });

  it('returns 404 for requests under /.well-known/taistamp/*', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp/foo',
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Not Found\n');
  });

  it('signs the response when a TAI-Nonce is supplied', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/.well-known/taistamp',
      { headers: { 'tai-nonce': makeNonceHeader() } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
    expect(response.headers.get('tai-leap-seconds')).not.toBeNull();
    // Selector matches the `test:` fixture seeded in
    // `vitest.config.ts`.
    expect(response.headers.get('tai-key-selector')).toBe('test');
    expect(response.headers.get('tai-signature')).toMatch(
      /^:[A-Za-z0-9+/=]+:$/,
    );
  });

  it('delegates apptly.co requests to the apptly-website service', async () => {
    const response = await SELF.fetch('https://apptly.co/anything');

    expect(response.status).toBe(501);
    expect(await response.text()).toBe('apptly-website stub (vitest)');
  });

  it('redirects apptly.me requests to apptly.co with the path dropped', async () => {
    const response = await SELF.fetch(
      'https://apptly.me/some/deep/path?q=1',
      { redirect: 'manual' },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://apptly.co');
  });

  it('redirects taistamp.org requests to the RFC repo with the path dropped', async () => {
    const response = await SELF.fetch(
      'https://taistamp.org/anywhere',
      { redirect: 'manual' },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://github.com/karasz/rfc-taistamp',
    );
  });
});
