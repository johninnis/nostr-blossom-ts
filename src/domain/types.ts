import type { Brand } from "@innis/nostr-core"

declare const sha256Brand: unique symbol
declare const serverUrlBrand: unique symbol

export type Sha256 = Brand<typeof sha256Brand>
export type ServerUrl = Brand<typeof serverUrlBrand>

export interface BlobDescriptor {
  readonly url: string
  readonly sha256: Sha256
  readonly size: number
  readonly type: string
  readonly uploaded: number
}

export type AuthAction = "get" | "upload" | "list" | "delete" | "media"

export type ReportType = "nudity" | "malware" | "profanity" | "illegal" | "spam" | "impersonation" | "other"

export const BLOSSOM_AUTH_EVENT_KIND = 24242
export const REPORT_EVENT_KIND = 1984

export interface ListBlobsQuery {
  readonly cursor?: string
  readonly limit?: number
  readonly since?: number
  readonly until?: number
}

export interface BlobHeaders {
  readonly contentType: string
  readonly contentLength?: number
}
