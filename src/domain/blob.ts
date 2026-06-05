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

export const createSha256 = (raw: string): Result<Sha256, ValidationError> => {
  const sha256 = sha256Tools.tryParse(raw)
  return sha256 !== null ? ok(sha256) : failure(new ValidationError("SHA-256 hash must be 64 hexadecimal characters"))
}

export const createServerUrl = (raw: string): Result<ServerUrl, ValidationError> => {
  const serverUrl = serverUrlTools.tryParse(raw)
  return serverUrl !== null
    ? ok(serverUrl)
    : failure(new ValidationError("Server URL must be a valid http or https origin"))
}

export const buildListQueryString = (query: ListBlobsQuery): string => {
  const params = new URLSearchParams()
  if (query.cursor !== undefined) params.set("cursor", query.cursor)
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.since !== undefined) params.set("since", String(query.since))
  if (query.until !== undefined) params.set("until", String(query.until))
  const str = params.toString()
  return str.length > 0 ? `?${str}` : ""
}

export const computeSha256 = async (data: ArrayBuffer): Promise<Result<Sha256, ValidationError>> =>
  createSha256(await computeSha256Core(data))

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
