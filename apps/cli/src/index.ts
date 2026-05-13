import { defineCommand } from 'citty';
import pkg from '../package.json';

/**
 * sass-dispatcher admin CLI — scaffold entry. Subcommands
 * (status, routes, etc.) land as the dispatcher firms up.
 */
export const main = defineCommand({
  meta: {
    name: 'sass-dispatcher',
    version: pkg.version,
    description: 'Apptly SaaS dispatcher admin CLI',
  },
  run: () => {
    process.stdout.write('sass-dispatcher (stub)\n');
  },
});
