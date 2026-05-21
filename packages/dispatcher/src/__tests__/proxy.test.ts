import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyHandler } from '../proxy';

const mockFetch = vi.fn<typeof fetch>();

// Type-only cast — at runtime the object is a plain
// Request with no `cf`/`geo` envelope. Fine while the
// SUT only reads url/headers/method.
const newIncoming = (
  input: string,
  init?: RequestInit,
): Request<unknown, IncomingRequestCfProperties> =>
  new Request(input, init) as unknown as Request<
    unknown,
    IncomingRequestCfProperties
  >;

const newOriginResponse = (): Response =>
  new Response('origin body', { status: 200 });

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(newOriginResponse());
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const firstCallRequest = (): Request =>
  mockFetch.mock.calls[0]?.[0] as Request;

const firstCallInit = (): RequestInit | undefined =>
  mockFetch.mock.calls[0]?.[1];

describe('proxyHandler', () => {
  it('rewrites host while preserving path and query', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/foo?bar=1&q=z'));

    expect(firstCallRequest().url)
      .toBe('https://upstream.test/foo?bar=1&q=z');
  });

  it('accepts a URL instance as target', async () => {
    const handler = proxyHandler({
      target: new URL('https://upstream.test'),
    });

    await handler(newIncoming('https://inbound.test/foo'));

    expect(firstCallRequest().url).toBe('https://upstream.test/foo');
  });

  it('honours a base path on the target as a prefix', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test/api' });

    await handler(newIncoming('https://inbound.test/foo?x=1'));

    expect(firstCallRequest().url)
      .toBe('https://upstream.test/api/foo?x=1');
  });

  it('collapses redundant slashes when the base has a trailing slash', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test/api/' });

    await handler(newIncoming('https://inbound.test/foo'));

    expect(firstCallRequest().url).toBe('https://upstream.test/api/foo');
  });

  it('returns the origin response verbatim', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    const response = await handler(newIncoming('https://inbound.test/'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('origin body');
  });

  it('passes cf.resolveOverride when configured', async () => {
    const handler = proxyHandler({
      target: 'https://upstream.test',
      resolveOverride: 'origin.upstream.test',
    });

    await handler(newIncoming('https://inbound.test/'));

    expect(firstCallInit()).toEqual({
      cf: { resolveOverride: 'origin.upstream.test' },
    });
  });

  it('omits the cf init when no resolveOverride', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/'));

    expect(firstCallInit()).toBeUndefined();
  });

  it('strips client-provided forwarding headers', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/', {
      headers: {
        'forwarded': 'for=10.0.0.1',
        'via': '1.1 evil',
        'x-real-ip': '10.0.0.1',
      },
    }));

    const out = firstCallRequest();
    expect(out.headers.get('forwarded')).toBeNull();
    expect(out.headers.get('via')).toBeNull();
    expect(out.headers.get('x-real-ip')).toBeNull();
  });

  it('overrides a spoofed x-forwarded-host with the inbound host', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/', {
      headers: { 'x-forwarded-host': 'attacker.test' },
    }));

    expect(firstCallRequest().headers.get('x-forwarded-host'))
      .toBe('inbound.test');
  });

  it('sets authoritative x-forwarded-* headers from the inbound envelope', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test:8443/', {
      headers: { 'cf-connecting-ip': '203.0.113.5' },
    }));

    const out = firstCallRequest();
    expect(out.headers.get('x-forwarded-host')).toBe('inbound.test:8443');
    expect(out.headers.get('x-forwarded-proto')).toBe('https');
    expect(out.headers.get('x-forwarded-for')).toBe('203.0.113.5');
  });

  it('strips the trailing colon for the http scheme', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('http://inbound.test/'));

    expect(firstCallRequest().headers.get('x-forwarded-proto')).toBe('http');
  });

  it('omits x-forwarded-for when cf-connecting-ip is absent', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/'));

    expect(firstCallRequest().headers.get('x-forwarded-for')).toBeNull();
  });

  it('forwards method and body', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/', {
      method: 'POST',
      body: 'payload',
    }));

    const out = firstCallRequest();
    expect(out.method).toBe('POST');
    expect(await out.text()).toBe('payload');
  });

  it('uses redirect: manual', async () => {
    const handler = proxyHandler({ target: 'https://upstream.test' });

    await handler(newIncoming('https://inbound.test/'));

    expect(firstCallRequest().redirect).toBe('manual');
  });

  // Unique target hostnames per row dodge cross-test
  // pollution of the module-scoped proxyHandler cache.
  describe('cache', () => {
    const OriginalURL = globalThis.URL;
    // Regular `function`, not arrow — `new urlSpy(...)`
    // requires a constructible impl, and arrows aren't.
    const urlSpy = vi.fn(function spied(
      url: string | URL,
      base?: string | URL,
    ): URL {
      return new OriginalURL(url, base as string);
    });

    beforeEach(() => {
      urlSpy.mockClear();
      vi.stubGlobal('URL', urlSpy);
    });

    const targetParseCount = (target: string): number =>
      urlSpy.mock.calls.filter(([url]) => url === target).length;

    it('shares the cached build across equal-content distinct targets', async () => {
      const target = 'https://cache-share.test/api';

      await proxyHandler({ target })(
        newIncoming('https://inbound.test/foo'),
      );
      await proxyHandler({ target })(
        newIncoming('https://inbound.test/bar'),
      );

      // 1st call (miss): serialiseTarget + buildProxy parse `target` → 2
      // 2nd call (hit):  serialiseTarget only → 1
      expect(targetParseCount(target)).toBe(3);
    });

    it('keys distinctly when only resolveOverride differs', async () => {
      const target = 'https://cache-override.test';

      await proxyHandler({ target, resolveOverride: 'a.upstream.test' })(
        newIncoming('https://inbound.test/'),
      );
      await proxyHandler({ target, resolveOverride: 'b.upstream.test' })(
        newIncoming('https://inbound.test/'),
      );

      // Both miss → each runs serialiseTarget + buildProxy → 4 total
      expect(targetParseCount(target)).toBe(4);
      expect(mockFetch.mock.calls[0]?.[1]).toEqual({
        cf: { resolveOverride: 'a.upstream.test' },
      });
      expect(mockFetch.mock.calls[1]?.[1]).toEqual({
        cf: { resolveOverride: 'b.upstream.test' },
      });
    });
  });
});
