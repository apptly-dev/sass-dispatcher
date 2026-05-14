import { defineCommand } from 'citty';
import pkg from '../package.json';

import whoami from './commands/whoami';
import zones from './commands/zones';

/**
 * sass-dispatcher admin CLI — scaffold entry. Subcommands
 * (status, routes, etc.) land as the dispatcher firms up.
 *
 * No top-level `run`: citty throws `E_NO_COMMAND` when no
 * subcommand matches, and `runMain` routes that through the
 * `showUsage` override wired in `bin.ts` (which uses
 * consola). Defining a `run` here would also fire after a
 * successful subcommand dispatch — citty 0.2.x still has
 * that behaviour despite the `context.subCommand` field
 * advertised in its types never being populated at runtime.
 */
export const main = defineCommand({
  meta: {
    name: 'sass-dispatcher',
    version: pkg.version,
    description: 'Apptly SaaS dispatcher admin CLI',
  },
  subCommands: { whoami, zones },
});
