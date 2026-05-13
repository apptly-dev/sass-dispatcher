import { describe, expect, it } from 'vitest';

import { newDispatcher } from '..';

describe('newDispatcher', () => {
  it('falls back to a 404 when no notFound is configured', async () => {
    const dispatch = newDispatcher({ routes: [] });

    const response = await dispatch(
      new Request('https://example.com/'),
      {},
      {},
    );

    expect(response.status).toBe(404);
  });

  it('honours a custom notFound handler', async () => {
    const dispatch = newDispatcher({
      routes: [],
      notFound: () => new Response('gone', { status: 410 }),
    });

    const response = await dispatch(
      new Request('https://example.com/'),
      {},
      {},
    );

    expect(response.status).toBe(410);
    expect(await response.text()).toBe('gone');
  });
});
