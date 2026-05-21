import { describe, expect, it } from 'vitest';

import {
  type Handler,
  newHandlerStore,
  newKeyedHandlerStore,
  newSingleton,
} from '..';

const ok = (body: string): Response =>
  new Response(body, { status: 200 });

// Type-only cast — at runtime the object is a plain
// Request with no `cf` envelope. Fine while the SUT
// only reads url/headers/method.
const request = (): Request<unknown, IncomingRequestCfProperties> =>
  new Request('https://example.com/') as unknown as Request<
    unknown,
    IncomingRequestCfProperties
  >;

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

  it('threads env to the builder and env+context to the built handler', async () => {
    interface Env { tag: string }
    const seen: {
      buildEnv?: Env
      context?: ExecutionContext
      env?: Env
    } = {};
    const store = newHandlerStore<undefined, string | undefined, Env>(
      (_key, _options, env) => {
        seen.buildEnv = env;
        return (_request, invokeEnv, context) => {
          seen.env = invokeEnv;
          seen.context = context;
          return ok('threaded');
        };
      },
    );

    const env: Env = { tag: 'env' };
    const context = {} as ExecutionContext;
    const response = await store('k')(request(), env, context);

    expect(await response.text()).toBe('threaded');
    expect(seen.buildEnv).toBe(env);
    expect(seen.env).toBe(env);
    expect(seen.context).toBe(context);
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

describe('newKeyedHandlerStore', () => {
  interface Input { id: string; tag: string }

  const idOf = (input: Input): string => input.id;

  it('builds once per derived key across equal-content inputs', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>((input) => {
      buildCount++;
      return () => ok(`built:${input.id}:${input.tag}`);
    }, idOf);

    const first = await store({ id: 'a', tag: 'one' })(request());
    const second = await store({ id: 'a', tag: 'one' })(request());

    expect(await first.text()).toBe('built:a:one');
    expect(await second.text()).toBe('built:a:one');
    expect(buildCount).toBe(1);
  });

  it('binds the input from the first call when keys collide', async () => {
    const store = newKeyedHandlerStore<Input>(
      (input) => () => ok(input.tag),
      idOf,
    );

    const first = await store({ id: 'a', tag: 'first' })(request());
    const second = await store({ id: 'a', tag: 'second' })(request());

    expect(await first.text()).toBe('first');
    expect(await second.text()).toBe('first');
  });

  it('builds separately for distinct derived keys', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>((input) => {
      buildCount++;
      return () => ok(input.id);
    }, idOf);

    await store({ id: 'a', tag: '' })(request());
    await store({ id: 'b', tag: '' })(request());
    await store({ id: 'a', tag: '' })(request());

    expect(buildCount).toBe(2);
  });

  it('passes input and env to the builder', async () => {
    interface Env { tag: string }
    const seen: {
      buildEnv?: Env
      input?: Input
    } = {};
    const store = newKeyedHandlerStore<Input, string, Env>(
      (input, env) => {
        seen.input = input;
        seen.buildEnv = env;
        return () => ok(input.id);
      },
      idOf,
    );

    const env: Env = { tag: 'env' };
    const input: Input = { id: 'k', tag: 't' };
    await store(input)(request(), env);

    expect(seen.input).toBe(input);
    expect(seen.buildEnv).toBe(env);
  });

  it('supports a non-string derived key', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input, number>((input) => {
      buildCount++;
      return () => ok(`built:${input.tag}`);
    }, (input) => input.id.codePointAt(0) ?? 0);

    const a = await store({ id: 'a', tag: 'one' })(request());
    const b = await store({ id: 'a', tag: 'two' })(request());

    expect(await a.text()).toBe('built:one');
    expect(await b.text()).toBe('built:one');
    expect(buildCount).toBe(1);
  });

  it('builds only once when concurrent requests race the same key', async () => {
    let buildCount = 0;
    let resolveBuild!: (handler: Handler) => void;
    const pendingBuild = new Promise<Handler>((resolve) => {
      resolveBuild = resolve;
    });
    const store = newKeyedHandlerStore<Input>(() => {
      buildCount++;
      return pendingBuild;
    }, idOf);

    const first = store({ id: 'k', tag: '' })(request());
    const second = store({ id: 'k', tag: '' })(request());

    resolveBuild(() => ok('once'));
    const [r1, r2] = await Promise.all([first, second]);

    expect(await r1.text()).toBe('once');
    expect(await r2.text()).toBe('once');
    expect(buildCount).toBe(1);
  });

  it('evicts a rejected build so the next call rebuilds', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>(async (input) => {
      buildCount++;
      if (buildCount === 1) {
        throw new Error('boom');
      }
      return () => ok(`built:${input.id}:${buildCount}`);
    }, idOf);

    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('boom');
    const response = await store({ id: 'k', tag: '' })(request());

    expect(await response.text()).toBe('built:k:2');
    expect(buildCount).toBe(2);
  });

  it('does not cache a synchronously-thrown build', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>(() => {
      buildCount++;
      throw new Error('sync boom');
    }, idOf);

    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('sync boom');
    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('sync boom');
    expect(buildCount).toBe(2);
  });

  it('does not evict the cache when the built Handler throws', async () => {
    let buildCount = 0;
    let invokeCount = 0;
    const store = newKeyedHandlerStore<Input>((input) => {
      buildCount++;
      return () => {
        invokeCount++;
        throw new Error(`handler boom:${input.id}`);
      };
    }, idOf);

    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('handler boom:k');
    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('handler boom:k');

    expect(buildCount).toBe(1);
    expect(invokeCount).toBe(2);
  });

  it('propagates toKey errors verbatim without building', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>((input) => {
      buildCount++;
      return () => ok(input.id);
    }, () => {
      throw new Error('keying boom');
    });

    await expect(store({ id: 'k', tag: '' })(request())).rejects.toThrow('keying boom');
    expect(buildCount).toBe(0);
  });

  it('rebuilds after concurrent racers see a rejected build', async () => {
    let buildCount = 0;
    const store = newKeyedHandlerStore<Input>(async (input) => {
      buildCount++;
      if (buildCount === 1) {
        throw new Error('shared boom');
      }
      return () => ok(`built:${input.id}:${buildCount}`);
    }, idOf);

    const a = store({ id: 'k', tag: '' })(request());
    const b = store({ id: 'k', tag: '' })(request());

    await expect(a).rejects.toThrow('shared boom');
    await expect(b).rejects.toThrow('shared boom');

    const response = await store({ id: 'k', tag: '' })(request());
    expect(await response.text()).toBe('built:k:2');
    expect(buildCount).toBe(2);
  });

  it('supports a synchronous builder', async () => {
    const store = newKeyedHandlerStore<Input>(
      (input) => () => ok(`sync:${input.id}`),
      idOf,
    );

    const response = await store({ id: 's', tag: '' })(request());

    expect(await response.text()).toBe('sync:s');
  });

  it('supports a Handler that returns Promise<Response>', async () => {
    const store = newKeyedHandlerStore<Input>(
      (input) => async () => ok(`async-handler:${input.id}`),
      idOf,
    );

    const response = await store({ id: 'k', tag: '' })(request());

    expect(await response.text()).toBe('async-handler:k');
  });
});

describe('newSingleton', () => {
  it('builds once with no extra args (default Extra = [])', async () => {
    let buildCount = 0;
    const get = newSingleton<string, string>((key) => {
      buildCount++;
      return `built:${key}`;
    });

    expect(await get('a')).toBe('built:a');
    expect(await get('a')).toBe('built:a');
    expect(buildCount).toBe(1);
  });

  it('builds separately for distinct keys', async () => {
    let buildCount = 0;
    const get = newSingleton<string, string>((key) => {
      buildCount++;
      return `built:${key}`;
    });

    await get('a');
    await get('b');
    await get('a');

    expect(buildCount).toBe(2);
  });

  it('threads extra args to the builder on the first call', async () => {
    let received: readonly [string, number] | undefined;
    const get = newSingleton<string, string, [number]>((key, n) => {
      received = [key, n];
      return `${key}:${n}`;
    });

    expect(await get('a', 1)).toBe('a:1');
    expect(await get('a', 999)).toBe('a:1');
    expect(received).toEqual(['a', 1]);
  });

  it('builds only once when concurrent callers race the same key', async () => {
    let buildCount = 0;
    let resolveBuild!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveBuild = resolve;
    });
    const get = newSingleton<string, string>(() => {
      buildCount++;
      return pending;
    });

    const first = get('k');
    const second = get('k');
    resolveBuild('once');
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe('once');
    expect(b).toBe('once');
    expect(buildCount).toBe(1);
  });

  it('evicts a rejected build so the next call rebuilds', async () => {
    let buildCount = 0;
    const get = newSingleton<string, string>(async (key) => {
      buildCount++;
      if (buildCount === 1) {
        throw new Error('boom');
      }
      return `built:${key}:${buildCount}`;
    });

    await expect(get('k')).rejects.toThrow('boom');
    expect(await get('k')).toBe('built:k:2');
    expect(buildCount).toBe(2);
  });

  it('does not cache a synchronously-thrown build', async () => {
    let buildCount = 0;
    const get = newSingleton<string, string>(() => {
      buildCount++;
      throw new Error('sync boom');
    });

    await expect(get('k')).rejects.toThrow('sync boom');
    await expect(get('k')).rejects.toThrow('sync boom');
    expect(buildCount).toBe(2);
  });
});
