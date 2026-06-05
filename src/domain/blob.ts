import type { Result } from "@innis/nostr-core"
import {
  computeSha256 as computeSha256Core,
  createBrand,
  createHexBrand,
  failure,
  isRecord,
  ok,
} from "@innis/nostr-core"
import type { BlobDescriptor, ListBlobsQuery, ServerUrl, Sha256 } from "./types.ts"
import { ValidationError } from "./errors.ts"

const sha256Tools = createHexBrand<Sha256, "InvalidSha256Error">({
  errorName: "InvalidSha256Error",
  errorPrefix: "Invalid SHA-256 hash",
  hexLength: 64,
})

const isHttpOrigin = (raw: string): boolean => {
  const url = URL.parse(raw)
  return url !== null && (url.protocol === "https:" || url.protocol === "http:") && url.origin === raw
}

const serverUrlTools = createBrand<ServerUrl, "InvalidServerUrlError">({
  errorName: "InvalidServerUrlError",
  errorPrefix: "Invalid server URL",
  validate: isHttpOrigin,
  normalise: (raw) => URL.parse(raw)?.origin ?? raw,
})

/** Validate and brand a raw string as a {@link Sha256} (64 lowercase hex characters), returning `Result<Sha256, ValidationError>`. Use this instead of casting an untrusted hash. */
export const createSha256 = (raw: string): Result<Sha256, ValidationError> => {
  const sha256 = sha256Tools.tryParse(raw)
  return sha256 !== null ? ok(sha256) : failure(new ValidationError("SHA-256 hash must be 64 hexadecimal characters"))
}

/** Validate and brand a raw string as a {@link ServerUrl}, normalising it to its http/https origin (scheme + host, no path). Returns `Result<ServerUrl, ValidationError>`. */
export const createServerUrl = (raw: string): Result<ServerUrl, ValidationError> => {
  const serverUrl = serverUrlTools.tryParse(raw)
  return serverUrl !== null
    ? ok(serverUrl)
    : failure(new ValidationError("Server URL must be a valid http or https origin"))
}

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

/** Compute the {@link Sha256} of an `ArrayBuffer`, branding the digest through the same {@link createSha256} path so there is one validation path. Returns `Result<Sha256, ValidationError>`. */
export const computeSha256 = async (data: ArrayBuffer): Promise<Result<Sha256, ValidationError>> =>
  createSha256(await computeSha256Core(data))

/**
 * Validate an unknown value (e.g. a parsed JSON object from a server response or a persisted cache)
 * as a {@link BlobDescriptor}. The `sha256` field is branded and lowercase-normalised through the same
 * {@link createSha256} path, so a successful result's `sha256` is a ready-to-use {@link Sha256}; a
 * non-hex hash or any missing/mistyped field fails the parse. This is the only validated
 * `unknown → BlobDescriptor` path — use it instead of casting raw input.
 */
export const parseBlobDescriptor = (value: unknown): Result<BlobDescriptor, ValidationError> => {
  if (!isRecord(value)) {
    return failure(new ValidationError("malformed Blossom blob descriptor"))
  }
  const sha256 = typeof value.sha256 === "string" ? sha256Tools.tryParse(value.sha256) : null
  if (
    sha256 === null ||
    typeof value.url !== "string" ||
    typeof value.size !== "number" ||
    typeof value.type !== "string" ||
    typeof value.uploaded !== "number"
  ) {
    return failure(new ValidationError("malformed Blossom blob descriptor"))
  }
  return ok({ url: value.url, sha256, size: value.size, type: value.type, uploaded: value.uploaded })
}

/**
 * Validate an unknown value as an array of {@link BlobDescriptor}s, applying {@link parseBlobDescriptor}
 * to each element. Returns the first element's failure if any element is malformed, otherwise the full
 * branded list. Used to parse a server's `GET /list` body, or a persisted list rehydrated from storage.
 */
export const parseBlobDescriptorList = (
  value: unknown,
): Result<ReadonlyArray<BlobDescriptor>, ValidationError> => {
  if (!Array.isArray(value)) {
    return failure(new ValidationError("malformed Blossom blob list"))
  }
  const descriptors: Array<BlobDescriptor> = []
  for (const item of value) {
    const parsed = parseBlobDescriptor(item)
    if (!parsed.success) return parsed
    descriptors.push(parsed.value)
  }
  return ok(descriptors)
}
