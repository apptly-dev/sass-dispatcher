/**
 * Worker bindings.
 */
export interface Env {
  /**
   * Ed25519 signing material for `/.well-known/taistamp`.
   * One or more `<selector>:<base64-32-byte-seed>` secrets
   * separated by whitespace, commas, semicolons, pipes,
   * or any character outside the `selector:base64`
   * alphabet. The last entry signs; leading entries are
   * reserved for rotation. The dispatcher accessor in
   * `index.ts` coalesces `undefined` to empty; the
   * taistamp rule serves unsigned on empty input.
   */
  TAISTAMP_SECRETS?: string

  /**
   * Service binding to the `apptly-website` worker — the
   * static-site worker that owns the `apptly.co` content
   * tree. The dispatcher delegates non-taistamp traffic on
   * that host through a `{ service }` rule.
   */
  APPTLY_WEBSITE: Service
}
