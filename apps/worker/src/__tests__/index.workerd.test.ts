import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker fetch (workerd pool)', () => {
  it('serves the stub banner for any request', async () => {
    const response = await SELF.fetch(
      'https://dispatcher.example.com/anything',
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('sass-dispatcher (stub)\n');
  });
});
