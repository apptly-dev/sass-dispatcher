import { newDispatcher } from '@apptly/sass-dispatcher';

import type { Env } from './env';

const dispatch = newDispatcher<Env, ExecutionContext>({
  routes: [],
  notFound: () => new Response('sass-dispatcher (stub)\n', {
    headers: { 'content-type': 'text/plain' },
  }),
});

export default {
  fetch: dispatch,
} satisfies ExportedHandler<Env>;
