import { consola } from 'consola';

/**
 * Log a fatal error and mark the process as failed. Sets
 * `process.exitCode = 1` so Node's natural-exit path
 * returns non-zero; centralised here so the contract with
 * citty's `runMain` — which does not call `process.exit(0)`
 * on the success path — lives in a single function. A
 * future citty release that breaks that assumption changes
 * this file only.
 *
 * Does not throw — call sites still `return` to unwind
 * back to citty. Throwing would either force every command
 * to catch or let citty's default handler stringify the
 * error, both worse for UX.
 *
 * Uses `consola.fatal` (level 0 → stderr) over
 * `consola.error` to mark the semantic difference: a fatal
 * call always precedes process termination.
 */
export function fatal(message: string): void {
  consola.fatal(message);
  process.exitCode = 1;
}
