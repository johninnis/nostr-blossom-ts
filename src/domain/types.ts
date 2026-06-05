import type { Brand } from "@innis/nostr-core"

declare const sha256Brand: unique symbol
declare const serverUrlBrand: unique symbol

/** A validated lowercase 64-character hex SHA-256 hash. Construct via {@link createSha256} or {@link computeSha256}; never cast a raw string. */
export type Sha256 = Brand<typeof sha256Brand>
/** A validated Blossom server origin (`https://host[:port]`, scheme + host only, no path). Construct via {@link createServerUrl}. */
export type ServerUrl = Brand<typeof serverUrlBrand>

/** The metadata a Blossom server returns for a stored blob (BUD-02). Its `sha256` is already branded, so it can be passed straight to a use-case. */
export interface BlobDescriptor {
  readonly url: string
  readonly sha256: Sha256
  readonly size: number
  readonly type: string
  readonly uploaded: number
}

/** The `t`-tag verb of a kind-24242 authorisation event, identifying the endpoint being authorised (BUD-11). */
export type AuthAction = "get" | "upload" | "list" | "delete" | "media"

/** The NIP-56 report category sent by {@link createReportBlob}. */
export type ReportType = "nudity" | "malware" | "profanity" | "illegal" | "spam" | "impersonation" | "other"

/** Event kind for Blossom authorisation events (BUD-01). */
export const BLOSSOM_AUTH_EVENT_KIND = 24242
/** Event kind for NIP-56 reports, used by the Blossom `/report` endpoint (BUD-09). */
export const REPORT_EVENT_KIND = 1984

/** Optional pagination and time-range parameters for {@link createListBlobs}, serialised by {@link buildListQueryString}. */
export interface ListBlobsQuery {
  readonly cursor?: string
  readonly limit?: number
  readonly since?: number
  readonly until?: number
}

/** Metadata returned by {@link createHeadBlob}: the blob's content type, plus its content length when the server reports a parseable `Content-Length`. */
export interface BlobHeaders {
  readonly contentType: string
  readonly contentLength?: number
}
