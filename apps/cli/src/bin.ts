#!/usr/bin/env -S node --experimental-strip-types
import { showUsage as cittyShowUsage, renderUsage, runMain } from 'citty';
import { consola } from 'consola';

import { main } from './index';

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
