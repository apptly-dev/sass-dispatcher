import type { ValueOrAccessor } from './types';

/**
 * Unwrap a {@link ValueOrAccessor}: pass-through for
 * literals, invoke for accessors. The `as` cast is
 * load-bearing — TypeScript's `typeof === 'function'`
 * can't narrow `T` to `(env: E) => T` when `T` is
 * itself a function type, hence `ValueOrAccessor`'s
 * "not usable on function-typed fields" caveat.
 */
export const getValue = <T, E>(
  input: ValueOrAccessor<T, E>,
  env: E,
): T =>
  typeof input === 'function' ?
    (input as (env: E) => T)(env) :
    input;
