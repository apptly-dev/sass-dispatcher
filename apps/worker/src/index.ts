import { newDispatcher } from '@apptly/sass-dispatcher';

import type { Env } from './env';

const handler: ExportedHandler<Env> = {
  fetch: newDispatcher<Env>({
    notFound: () => new Response('sass-dispatcher (stub)\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  }),
};

export default handler;
