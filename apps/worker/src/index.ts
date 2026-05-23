import {
  type Handler,
  newDispatcher,
  type Rule,
} from '@apptly/sass-dispatcher';

import type { Env } from './env';

const fallback: Handler<Env> = () => new Response('sass-dispatcher (stub)\n', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

const taistamp = (env: Env): string => env.TAISTAMP_SECRETS ?? '';

/* cSpell:words sunxi */
const sunxiWiki: Rule<Env> = {
  proxyTo: {
    target: 'https://linux-sunxi.org',
    resolveOverride: 'minima.linux-sunxi.org',
  },
};

const handler: ExportedHandler<Env> = {
  fetch: newDispatcher<Env>({
    fallback,
    hosts: {
      // apptly.co
      'apptly.co': [
        { taistamp },
        { service: (env) => env.APPTLY_WEBSITE },
      ],
      'apptly.me': [
        { taistamp },
        {
          redirectTo: 'https://apptly.co',
          redirectCode: 301,
        },
      ],
      // linux-sunxi.org
      'sunxi.apptly.me': sunxiWiki,
      'linux-sunxi.org': sunxiWiki,
      'sunxi.org': sunxiWiki,
      'sunxi-linux.org': sunxiWiki,
      // taistamp.org
      'taistamp.org': [
        { taistamp },
        {
          redirectTo: 'https://github.com/karasz/rfc-taistamp',
          redirectCode: 301,
        },
      ],
    },
  }),
};

export default handler;
