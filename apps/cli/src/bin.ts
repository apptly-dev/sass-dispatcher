#!/usr/bin/env -S node --experimental-strip-types
import { showUsage as cittyShowUsage, renderUsage, runMain } from 'citty';
import { consola } from 'consola';

import { main } from './index';

// Treat a closed stdout (e.g., `| head -3`) as a clean exit
// rather than letting the unhandled 'error' event crash the
// process with a stack trace. Node's default is to throw, which
// is the wrong behaviour for a piped CLI.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') {
    process.exit(0);
  }
  throw error;
});

type ShowUsage = typeof cittyShowUsage;

/**
 * Replacement for citty's default `showUsage` so the banner
 * goes through consola — `warn` (level 1) routes to stderr,
 * keeping stdout reserved for command data. The WARN
 * decoration is acceptable for help/usage output.
 */
const showUsage: ShowUsage = async (cmd, parent) => {
  consola.warn(await renderUsage(cmd, parent));
};

runMain(main, { showUsage });
