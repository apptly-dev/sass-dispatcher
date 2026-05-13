#!/usr/bin/env -S node --experimental-strip-types
import { showUsage as cittyShowUsage, renderUsage, runMain } from 'citty';
import { consola } from 'consola';

import { main } from './index';

/**
 * Replacement for citty's default `showUsage` so its
 * error-path renders also route through consola, keeping
 * one output channel across the CLI.
 */
const showUsage: typeof cittyShowUsage = async (cmd, parent) => {
  consola.log(await renderUsage(cmd, parent));
};

runMain(main, { showUsage });
