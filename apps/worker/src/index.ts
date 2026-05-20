import {
  type Handler,
  newDispatcher,
} from '@apptly/sass-dispatcher';

import type { Env } from './env';

const fallback: Handler<Env> = () => new Response('sass-dispatcher (stub)\n', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

const handler: ExportedHandler<Env> = {
  fetch: newDispatcher<Env>({
    fallback,
  }),
};

export default handler;
