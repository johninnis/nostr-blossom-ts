import type { Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import { ValidationError } from "../domain/errors.ts"
import { computeSha256 } from "../domain/blob.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface GetBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly verify?: boolean
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/** The result of {@link createGetBlob}: the blob body as a `Blob`, plus the `contentType` read from the response header. */
export interface BlobResponse {
  readonly data: Blob
  readonly contentType: string
}

const verifyBlobContent = async (data: Blob, sha256: Sha256): Promise<Result<void, ValidationError>> => {
  const digest = await computeSha256(await data.arrayBuffer())
  if (!digest.success) return digest
  if (digest.value !== sha256) {
    return failure(new ValidationError(`blob content hashes to ${digest.value}, not the requested ${sha256}`))
  }
  return ok(undefined)
}

/**
 * Build the get use-case: `GET /<sha256>` with a `get` auth event, returning the body as a
 * {@link BlobResponse}. With `verify: true` the body is hashed and compared to the requested
 * `sha256` — a mismatch (a corrupt or lying server) returns a `ValidationError` failure instead of
 * the blob. Verification is off by default for a single trusted server; when fetching through a
 * fallback chain use {@link createGetBlobWithFallback}, which always verifies.
 */
export const createGetBlob = (
  deps: BlossomDeps,
): (input: GetBlobInput) => Promise<Result<BlobResponse, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "get",
      content: "Get Blob",
      method: "GET",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })

    if (!response.success) return response

    const blobResult = await response.value.blob()
    if (!blobResult.success) return blobResult

    if (input.verify === true) {
      const verified = await verifyBlobContent(blobResult.value, input.sha256)
      if (!verified.success) return verified
    }

    // Content type is read from the response header, not from data.type: the HttpClient port makes
    // no guarantee that blob() preserves the MIME type (the in-memory test client does not), so the
    // header is the authoritative source.
    const contentType = response.value.headers.get("content-type") ?? "application/octet-stream"

    return ok({ data: blobResult.value, contentType })
  }
}
