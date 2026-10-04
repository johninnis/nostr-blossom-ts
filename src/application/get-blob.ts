import type { Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import type { BlossomFailure, ValidationFailure } from "../domain/failure/blossom-failure.ts"
import { computeSha256 } from "../domain/blob.ts"
import { extractSha256FromUrl } from "../domain/blob-url.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface GetBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly verify?: boolean
  /** The blob's size in bytes when known — a `BlobDescriptor`'s `size` — which caps the body read; {@link DEFAULT_MAX_BLOB_BYTES} when omitted. */
  readonly expectedSize?: number | undefined
  readonly signal?: AbortSignal | undefined
}

/** Ceiling, in bytes, on a blob body read by {@link createGetBlob} when the caller gives no `expectedSize`: 256 MiB, room for most media while keeping one download from exhausting a browser tab. */
export const DEFAULT_MAX_BLOB_BYTES = 256 * 1024 * 1024

/** The result of {@link createGetBlob}: the blob body as a `Blob`, plus the `contentType` read from the response's `Content-Type` header (`application/octet-stream` when it has none, as BUD-01 defaults). */
export interface BlobResponse {
  readonly data: Blob
  readonly contentType: string
}

const verifyBlobContent = async (data: Blob, sha256: Sha256): Promise<Result<void, ValidationFailure>> => {
  const digest = computeSha256(await data.arrayBuffer())
  if (digest !== sha256) {
    return failure({ type: "validation", message: `blob content hashes to ${digest}, not the requested ${sha256}` })
  }
  return ok(undefined)
}

/**
 * Build the get use-case: `GET /<sha256>` with a `get` auth event, returning the body as a
 * {@link BlobResponse}. A redirect is followed only to a URL carrying the same sha256, the one BUD-01 permits
 * ("it MUST redirect to a URL containing the same sha256 hash as the requested blob"), and the body is capped at
 * `expectedSize` when given, else {@link DEFAULT_MAX_BLOB_BYTES}. With `verify: true` the body is hashed and compared to the requested
 * `sha256` — a mismatch (a corrupt or lying server) returns a `ValidationFailure` instead of
 * the blob. Verification is off by default for a single trusted server; when fetching through a
 * fallback chain use {@link createGetBlobWithFallback}, which always verifies.
 */
export const createGetBlob = (
  deps: BlossomDeps,
): (input: GetBlobInput) => Promise<Result<BlobResponse, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "get",
      content: "Get Blob",
      method: "GET",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
      signal: input.signal,
      followRedirectTo: (url) => extractSha256FromUrl(url) === input.sha256,
      maxBodyBytes: input.expectedSize ?? DEFAULT_MAX_BLOB_BYTES,
    })

    if (!response.success) return response

    const blobResult = await response.value.blob()
    if (!blobResult.success) return blobResult

    // Deliberate: one trusted server is not hashed unless asked; the fallback chain always verifies — see ADR-0007
    if (input.verify === true) {
      const verified = await verifyBlobContent(blobResult.value, input.sha256)
      if (!verified.success) return verified
    }

    // Deliberate: the header, not the Blob's own type, which the HttpClient port does not promise to keep — see ADR-0008
    const contentType = response.value.headers.get("content-type") ?? "application/octet-stream"

    return ok({ data: blobResult.value, contentType })
  }
}
