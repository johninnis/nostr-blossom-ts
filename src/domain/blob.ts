import type { FileMetadata } from "@innis/nostr-core"
import {
  createBrand,
  isLowercaseHex,
  isRecord,
  isValidTagsArray,
  parseFileMetadataTags,
  sha256Hex,
} from "@innis/nostr-core"
import type { BlobDescriptor, ListBlobsQuery, ServerUrl, Sha256 } from "./types.ts"

const canonicaliseSha256 = (raw: string): string | null => {
  const lowered = raw.toLowerCase()
  return isLowercaseHex(lowered, 64) ? lowered : null
}

const sha256Tools = createBrand<Sha256>({ canonicalise: canonicaliseSha256 })

const canonicaliseHttpOrigin = (raw: string): string | null => {
  const url = URL.parse(raw)
  return url !== null && (url.protocol === "https:" || url.protocol === "http:") ? url.origin : null
}

const serverUrlTools = createBrand<ServerUrl>({ canonicalise: canonicaliseHttpOrigin })

/** Validate and brand a raw string as a {@link Sha256} (64 hexadecimal characters, lowercase-normalised), or `null` when it is not one. Use this instead of casting an untrusted hash. */
export const createSha256 = (raw: string): Sha256 | null => sha256Tools.parse(raw)

/** Validate and brand a raw string as a {@link ServerUrl}, normalising it to its http/https origin (scheme + host, no path), or `null` when it is not a valid http or https URL. */
export const createServerUrl = (raw: string): ServerUrl | null => serverUrlTools.parse(raw)

/** Serialise a {@link ListBlobsQuery} into a URL query string with a leading `?`, or `""` when no fields are set. Used by {@link createListBlobs}. */
export const buildListQueryString = (query: ListBlobsQuery): string => {
  const params = new URLSearchParams()
  if (query.cursor !== undefined) params.set("cursor", query.cursor)
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.since !== undefined) params.set("since", String(query.since))
  if (query.until !== undefined) params.set("until", String(query.until))
  const str = params.toString()
  return str.length > 0 ? `?${str}` : ""
}

/** Compute the {@link Sha256} of any `BufferSource` (an `ArrayBuffer` or typed-array view), branding the digest through the same {@link createSha256} path so there is one validation path. Throws if the digest is not a hash — a broken invariant, never an input failure. */
export const computeSha256 = (data: BufferSource): Sha256 => {
  const sha256 = createSha256(sha256Hex(data))
  if (sha256 === null) throw new Error("SHA-256 produced a digest that is not a 64-character hex hash")
  return sha256
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const parseNip94Field = (value: unknown): FileMetadata | null =>
  isValidTagsArray(value) ? parseFileMetadataTags(value) : null

/**
 * Validate an unknown value (e.g. a parsed JSON object from a server response or a persisted cache)
 * as a {@link BlobDescriptor}. The `sha256` field is branded and lowercase-normalised through the same
 * {@link createSha256} path, so a parsed descriptor's `sha256` is a ready-to-use {@link Sha256}; a
 * non-hex hash, a `size` or `uploaded` that is not a non-negative whole number, or any other missing/mistyped field
 * yields `null`. A BUD-08 `nip94` field, when present,
 * must be a NIP-94 tag list carrying a `url` and is parsed to a `FileMetadata`. This is the only
 * validated `unknown → BlobDescriptor` path — use it instead of casting raw input.
 */
export const parseBlobDescriptor = (value: unknown): BlobDescriptor | null => {
  if (!isRecord(value)) return null
  const sha256 = typeof value.sha256 === "string" ? sha256Tools.parse(value.sha256) : null
  if (
    sha256 === null ||
    typeof value.url !== "string" ||
    !isNonNegativeInteger(value.size) ||
    typeof value.type !== "string" ||
    !isNonNegativeInteger(value.uploaded)
  ) {
    return null
  }
  const descriptor = { url: value.url, sha256, size: value.size, type: value.type, uploaded: value.uploaded }
  if (value.nip94 === undefined) return descriptor
  const nip94 = parseNip94Field(value.nip94)
  return nip94 === null ? null : { ...descriptor, nip94 }
}

/**
 * Validate an unknown value as an array of {@link BlobDescriptor}s, applying {@link parseBlobDescriptor}
 * to each element. Returns `null` if the value is not an array or any element is malformed, otherwise the
 * full branded list. Used to parse a server's `GET /list` body, or a persisted list rehydrated from storage.
 */
export const parseBlobDescriptorList = (
  value: unknown,
): ReadonlyArray<BlobDescriptor> | null => {
  if (!Array.isArray(value)) return null
  const descriptors: Array<BlobDescriptor> = []
  for (const item of value) {
    const parsed = parseBlobDescriptor(item)
    if (parsed === null) return null
    descriptors.push(parsed)
  }
  return descriptors
}
