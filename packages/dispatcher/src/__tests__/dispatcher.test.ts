import { describe, expect, it, vi } from 'vitest';

import { newDispatcher, type Rule } from '..';

const executionContext = {} as ExecutionContext;

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

describe('newDispatcher', () => {
  it('falls back to a 404 when no rules match', async () => {
    const dispatch = newDispatcher({});

    const response = await dispatch(
      newIncoming('https://example.com/'),
      {},
      executionContext,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(await response.text()).toBe('Not Found\n');
  });

  it('honours a custom notFound handler', async () => {
    const dispatch = newDispatcher({
      notFound: () => new Response('gone', { status: 410 }),
    });

    const response = await dispatch(
      newIncoming('https://example.com/'),
      {},
      executionContext,
    );

    expect(response.status).toBe(410);
    expect(await response.text()).toBe('gone');
  });

  it('passes request, env, and context to notFound', async () => {
    const seen: {
      context?: ExecutionContext
      env?: { tag: string }
      request?: Request<unknown, IncomingRequestCfProperties>
    } = {};
    const dispatch = newDispatcher<{ tag: string }>({
      notFound: (request, env, context) => {
        seen.request = request;
        seen.env = env;
        seen.context = context;
        return new Response(undefined, { status: 418 });
      },
    });

    const request = newIncoming('https://example.com/');
    const env = { tag: 'sentinel' };
    const response = await dispatch(request, env, executionContext);

    expect(response.status).toBe(418);
    expect(seen.request).toBe(request);
    expect(seen.env).toBe(env);
    expect(seen.context).toBe(executionContext);
  });

  it('serves taistamp on the configured host', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      hosts: {
        'example.com': [{ taistamp: (env) => env.secret }],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp'),
      { secret: '' },
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
  });

  it('falls through when the host is not configured', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      hosts: {
        'example.com': [{ taistamp: (env) => env.secret }],
      },
    });

    const response = await dispatch(
      newIncoming('https://other.test/.well-known/taistamp'),
      { secret: '' },
      executionContext,
    );

    expect(response.status).toBe(404);
  });

  it('404s under the taistamp prefix on the owning host', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      hosts: {
        'example.com': [{ taistamp: (env) => env.secret }],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp/foo'),
      { secret: '' },
      executionContext,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(await response.text()).toBe('Not Found\n');
  });

  it('falls through when the host has no matching rule', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': [
          {
            match: '/foo',
            redirectTo: 'https://elsewhere.test/',
            redirectCode: 301,
          },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/bar'),
      {},
      executionContext,
    );

    expect(response.status).toBe(404);
  });

  it('serves a redirect rule', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': [
          {
            match: '/*',
            redirectTo: 'https://elsewhere.test/',
            redirectCode: 301,
          },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/anything'),
      {},
      executionContext,
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://elsewhere.test/');
  });

  it('sends redirectTo verbatim — no :param substitution', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': [
          {
            match: '/foo/:id',
            redirectTo: 'https://elsewhere.test/items/:id',
            redirectCode: 301,
          },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/foo/42'),
      {},
      executionContext,
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://elsewhere.test/items/:id',
    );
  });

  it('honours rule order — taistamp before redirect catch-all', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      hosts: {
        'example.com': [
          { taistamp: (env) => env.secret },
          {
            match: '/*',
            redirectTo: 'https://elsewhere.test/',
            redirectCode: 301,
          },
        ],
      },
    });

    const onTaistamp = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp'),
      { secret: '' },
      executionContext,
    );
    expect(onTaistamp.status).toBe(200);
    expect(onTaistamp.headers.get('content-type')).toBe('application/tai64n');

    const onOther = await dispatch(
      newIncoming('https://example.com/other'),
      { secret: '' },
      executionContext,
    );
    expect(onOther.status).toBe(301);
    expect(onOther.headers.get('location')).toBe('https://elsewhere.test/');
  });

  it('defaults match to /* when omitted from a redirect rule', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': [
          {
            redirectTo: 'https://elsewhere.test/',
            redirectCode: 301,
          },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/any/deep/path'),
      {},
      executionContext,
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://elsewhere.test/');
  });

  it('redirectTo accepts an env-time accessor', async () => {
    const dispatch = newDispatcher<{ target: string }>({
      hosts: {
        'example.com': [
          {
            redirectTo: (env) => env.target,
            redirectCode: 302,
          },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/'),
      { target: 'https://resolved.test/landing' },
      executionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://resolved.test/landing',
    );
  });

  it('taistamp accepts a literal secret', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': [{ taistamp: '' }],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp'),
      {},
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/tai64n');
  });

  it('accepts a single rule for a host (not wrapped in an array)', async () => {
    const dispatch = newDispatcher({
      hosts: {
        'example.com': {
          redirectTo: 'https://elsewhere.test/',
          redirectCode: 301,
        },
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/any'),
      {},
      executionContext,
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://elsewhere.test/');
  });

  it('uses the configured notFound under the taistamp prefix', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      notFound: () => new Response('teapot', { status: 418 }),
      hosts: {
        'example.com': [{ taistamp: (env) => env.secret }],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp/sub'),
      { secret: '' },
      executionContext,
    );

    expect(response.status).toBe(418);
    expect(await response.text()).toBe('teapot');
  });

  it('warns and skips rules without a recognised discriminant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const dispatch = newDispatcher({
        hosts: {
          'example.com': [{ kind: 'unknown' } as unknown as Rule],
        },
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const call = warnSpy.mock.calls[0];
      expect(call).toBeDefined();
      const [message, rule] = call as [string, unknown];
      expect(message).toContain('example.com');
      expect(message).toContain('skipping');
      expect(rule).toEqual({ kind: 'unknown' });

      const response = await dispatch(
        newIncoming('https://example.com/any'),
        {},
        executionContext,
      );
      expect(response.status).toBe(404);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('honours rule order — redirect catch-all before taistamp', async () => {
    const dispatch = newDispatcher<{ secret: string }>({
      hosts: {
        'example.com': [
          {
            match: '/*',
            redirectTo: 'https://elsewhere.test/',
            redirectCode: 301,
          },
          { taistamp: (env) => env.secret },
        ],
      },
    });

    const response = await dispatch(
      newIncoming('https://example.com/.well-known/taistamp'),
      { secret: '' },
      executionContext,
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://elsewhere.test/');
  });
});
