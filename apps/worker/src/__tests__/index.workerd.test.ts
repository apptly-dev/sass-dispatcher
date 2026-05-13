import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../index';

describe('worker fetch (workerd pool)', () => {
  it('serves the stub banner for any request', async () => {
    expect(env).toBeDefined();

    const response = await worker.fetch!(
      new Request('https://dispatcher.example.com/anything'),
      env as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('sass-dispatcher (stub)\n');
  });
});
