import { describe, expect, it } from 'vitest';

import { type Handler, newHandlerStore } from '..';

const ok = (body: string): Response =>
  new Response(body, { status: 200 });

const request = (): Request => new Request('https://example.com/');

describe('newHandlerStore', () => {
  it('builds once per key when called repeatedly with the same key', async () => {
    let buildCount = 0;
    const store = newHandlerStore<undefined>(async (key) => {
      buildCount++;
      return () => ok(`built:${key ?? 'undef'}`);
    });

    const first = await store('alpha')(request());
    const second = await store('alpha')(request());

    expect(await first.text()).toBe('built:alpha');
    expect(await second.text()).toBe('built:alpha');
    expect(buildCount).toBe(1);
  });

  it('builds separately for distinct keys', async () => {
    let buildCount = 0;
    const store = newHandlerStore<undefined>(async (key) => {
      buildCount++;
      return () => ok(`built:${key ?? 'undef'}`);
    });

    await store('a')(request());
    await store('b')(request());
    await store('a')(request());

    expect(buildCount).toBe(2);
  });

  it('accepts undefined as a key', async () => {
    let seen: string | undefined = 'untouched';
    const store = newHandlerStore<undefined>(async (key) => {
      seen = key;
      return () => ok(`built:${key ?? 'undef'}`);
    });

    const response = await store(undefined)(request());

    expect(await response.text()).toBe('built:undef');
    expect(seen).toBeUndefined();
  });

  it('passes options through to the builder', async () => {
    interface Options { label: string }
    let seenOptions: Options | undefined;
    const store = newHandlerStore<Options>((_key, options) => {
      seenOptions = options;
      return () => ok(options?.label ?? '');
    });

    const response = await store('k', { label: 'tagged' })(request());

    expect(await response.text()).toBe('tagged');
    expect(seenOptions).toEqual({ label: 'tagged' });
  });

  it('builds only once when concurrent requests race the same key', async () => {
    let buildCount = 0;
    let resolveBuild!: (handler: Handler) => void;
    const pendingBuild = new Promise<Handler>((resolve) => {
      resolveBuild = resolve;
    });
    const store = newHandlerStore<undefined>(() => {
      buildCount++;
      return pendingBuild;
    });

    const first = store('k')(request());
    const second = store('k')(request());

    resolveBuild(() => ok('once'));
    const [r1, r2] = await Promise.all([first, second]);

    expect(await r1.text()).toBe('once');
    expect(await r2.text()).toBe('once');
    expect(buildCount).toBe(1);
  });

  it('ignores later options when the key is already cached', async () => {
    interface Options { label: string }
    const seen: Options[] = [];
    const store = newHandlerStore<Options>((_key, options) => {
      if (options) seen.push(options);
      return () => ok(options?.label ?? '');
    });

    await store('k', { label: 'first' })(request());
    const response = await store('k', { label: 'second' })(request());

    expect(await response.text()).toBe('first');
    expect(seen).toEqual([{ label: 'first' }]);
  });

  it('evicts a rejected build so the next call rebuilds', async () => {
    let buildCount = 0;
    const store = newHandlerStore<undefined>(async (key) => {
      buildCount++;
      if (buildCount === 1) {
        throw new Error('boom');
      }
      return () => ok(`built:${key ?? 'undef'}:${buildCount}`);
    });

    await expect(store('k')(request())).rejects.toThrow('boom');
    const response = await store('k')(request());

    expect(await response.text()).toBe('built:k:2');
    expect(buildCount).toBe(2);
  });

  it('rebuilds after concurrent racers see a rejected build', async () => {
    let buildCount = 0;
    const store = newHandlerStore<undefined>(async (key) => {
      buildCount++;
      if (buildCount === 1) {
        throw new Error('shared boom');
      }
      return () => ok(`built:${key ?? 'undef'}:${buildCount}`);
    });

    const a = store('k')(request());
    const b = store('k')(request());

    await expect(a).rejects.toThrow('shared boom');
    await expect(b).rejects.toThrow('shared boom');

    const response = await store('k')(request());
    expect(await response.text()).toBe('built:k:2');
    expect(buildCount).toBe(2);
  });

  it('does not cache a synchronously-thrown build', async () => {
    let buildCount = 0;
    const store = newHandlerStore<undefined>(() => {
      buildCount++;
      throw new Error('sync boom');
    });

    await expect(store('k')(request())).rejects.toThrow('sync boom');
    await expect(store('k')(request())).rejects.toThrow('sync boom');
    expect(buildCount).toBe(2);
  });

  it('does not evict the cache when the built Handler throws', async () => {
    let buildCount = 0;
    let invokeCount = 0;
    const store = newHandlerStore<undefined>((key) => {
      buildCount++;
      return () => {
        invokeCount++;
        throw new Error(`handler boom:${key ?? 'undef'}`);
      };
    });

    await expect(store('k')(request())).rejects.toThrow('handler boom:k');
    await expect(store('k')(request())).rejects.toThrow('handler boom:k');

    expect(buildCount).toBe(1);
    expect(invokeCount).toBe(2);
  });

  it('supports a synchronous builder', async () => {
    const store = newHandlerStore<undefined>(
      (key) => () => ok(`sync:${key ?? 'undef'}`),
    );

    const response = await store('s')(request());

    expect(await response.text()).toBe('sync:s');
  });

  it('supports a Handler that returns Promise<Response>', async () => {
    const store = newHandlerStore<undefined>(
      (key) => async () => ok(`async-handler:${key ?? 'undef'}`),
    );

    const response = await store('k')(request());

    expect(await response.text()).toBe('async-handler:k');
  });
});
