// cspell:words RDATA
/**
 * Minimal type shapes for the Cloudflare DoH JSON API
 * (https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/).
 *
 * Field names mirror the wire JSON exactly — upper-case
 * header flags (`AD`, `CD`, `RA`, `RD`, `TC`, `Status`)
 * and section keys (`Question`, `Answer`, …) — so the
 * envelope is recognisable in the type without renaming.
 * Numeric record-type codes follow the IANA DNS
 * parameters registry (1 = A, 28 = AAAA, …).
 */

/**
 * Question-section entry — the `{ NAME, TYPE }` tuple
 * the client asked about. CLASS is always IN over the
 * public DoH endpoint and is not surfaced.
 */
export interface DoHQuestion {
  /** Queried hostname, root dot included (e.g. `apptly.me.`). */
  name: string
  /** IANA DNS type code (1 = A, 28 = AAAA, 5 = CNAME, …). */
  type: number
}

/**
 * Resource Record (RR) returned in the `Answer` or
 * `Authority` sections. Extends {@link DoHQuestion}
 * with the RR-specific `TTL` and `data` (RDATA)
 * fields.
 */
export interface DoHResourceRecord extends DoHQuestion {
  /** Rendered RDATA — the A-record IP, CNAME target, TXT body, … */
  data: string
  /** Remaining cache lifetime in seconds. */
  TTL: number
}

/**
 * Top-level JSON envelope returned by
 * `cloudflare-dns.com/dns-query` under the
 * `accept: application/dns-json` header. Fields are
 * grouped (blank-line separated) into DNS header flags,
 * the message sections, and the optional diagnostic
 * comment.
 */
export interface DoHResponse {
  /** Authentic Data — set when the answer is DNSSEC-validated. */
  AD: boolean
  /** Checking Disabled — DNSSEC validation was bypassed. */
  CD: boolean
  /** Recursion Available — resolver is willing to recurse. */
  RA: boolean
  /** Recursion Desired — echo of the query-side flag. */
  RD: boolean
  /** Response code (rcode): 0 = NOERROR, 2 = SERVFAIL, 3 = NXDOMAIN, … */
  Status: number
  /** Truncated — the UDP response was cut and TCP retry is implied. */
  TC: boolean

  /** Answer section — records that directly answer the question. */
  Answer?: DoHResourceRecord[]
  /** Authority section — NS records for the responsible zone. */
  Authority?: DoHResourceRecord[]
  /** Question section — what was asked. CF returns at most one entry. */
  Question: DoHQuestion[]

  /** Human-readable diagnostic from the resolver (NXDOMAIN cause, …). */
  Comment?: string
}
